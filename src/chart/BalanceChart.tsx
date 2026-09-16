import { useId, useRef, useState } from 'react';

import type { BalanceResult } from '../engine/balance';
import type { UnitSystem } from '../model/types';
import { LABELS, toBtuHFt2, toF } from '../model/units';
import { crossing, linearScale, niceBounds, niceCeiling, ticksBetween, ticksUpTo } from './scales';

/**
 * The 24-hour balance.
 *
 * Loss against gain, hour by hour, with every hour the building is short shaded
 * between the two curves. A Passive House reference line used to be drawn here
 * and has been removed: it is a certification threshold from a scheme this tool
 * has nothing else to do with, and on a chart of one building's own loss and
 * gain it read as a target rather than the aside it was meant to be.
 *
 * **Outdoor dry-bulb runs on its own axis, on the right.** It is the driver
 * behind the loss curve and explains its shape — the loss peak IS the
 * temperature trough — so reading them together is most of the point. It is a
 * reference and nothing more: it is not in the balance, it never changes the
 * gap between the curves, and it is drawn dashed in a neutral token so it
 * cannot be mistaken for a third quantity being compared.
 *
 * The second axis is genuinely a second axis, not the first one relabelled: a
 * temperature is not a heat flux and sharing a scale would put a meaningless
 * number on one of them. It needs `niceBounds` rather than `niceCeiling`
 * because a cold design day goes below zero and a zero-based scale would clip
 * exactly the hours this tool exists for.
 *
 * **The gain line is PASSIVE gain, and stays passive.** When IT sits on
 * chilled water its heat never enters the room, so it is not on that line — a
 * filled band above it shows what a recovery chiller could add, and the band IS
 * the recovery. The deficit shading keeps measuring to the passive line,
 * because that is what the space actually receives and the shading is the claim
 * people read.
 *
 * **A band rather than a line, because a line disappears at exactly the moment
 * it matters most.** Capped at the loss curve, the recovery line lay underneath
 * the loss line in every hour recovery covered — which is to say it was
 * invisible whenever the answer was "recovered". The band is still visible when
 * its top edge is hidden, and it reads better anyway: the area between the two
 * curves is the heat being moved.
 *
 * Hovering emits the hour, which the section drawing then redraws to. That one
 * interaction is what makes the two halves a single tool rather than two panels
 * sharing a screen.
 */

const WIDTH = 880;
/**
 * 560, not 380.
 *
 * The chart shares a row with the section drawing and stretches to its height.
 * At the old aspect it rendered 266 px tall in a 549 px panel and left half the
 * box empty. Taller is also simply better here: the reading is the GAP between
 * two curves, and vertical resolution is what makes that gap legible. Text is
 * unaffected — the horizontal scale sets the type size, and that has not moved.
 */
const HEIGHT = 560;
/** `right` is 52, not 20: the outdoor-temperature axis and its labels live there. */
const PAD = { top: 22, right: 52, bottom: 46, left: 54 };

export interface BalanceChartProps {
  readonly result: BalanceResult;
  readonly floorArea: number;
  readonly units: UnitSystem;
  readonly hoveredHour: number | null;
  readonly onHoverHour: (hour: number | null) => void;
}

export function BalanceChart({ result, floorArea, units, hoveredHour, onHoverHour }: BalanceChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [focusHour, setFocusHour] = useState<number | null>(null);
  const uid = useId().replace(/:/g, '');
  const hatchId = `hb-hatch-${uid}`;

  const ip = units === 'IP';
  const convert = (wattsPerSqM: number) => (ip ? toBtuHFt2(wattsPerSqM) : wattsPerSqM);
  const labels = LABELS[units];

  const area = floorArea > 0 ? floorArea : 1;
  const loss = result.hours.map((h) => convert(h.loss / area));
  const gain = result.hours.map((h) => convert(h.gain / area));
  /**
   * Passive gain plus the recovery the hour actually USES, capped at the loss.
   *
   * Drawn uncapped, a 400 kW hall puts this line four times higher than the
   * loss curve, the axis stretches to hold it, and the two curves the chart
   * exists to compare collapse into a band at the bottom. Capped, the line
   * rises off the passive curve and meets the loss curve exactly where recovery
   * closes the gap — which is the reading anyone wants from it — and where
   * recovery falls short it stops in between, leaving the remaining deficit
   * visible above it.
   *
   * The capacity that goes unused is a number, not a shape: the verdict reports
   * what the machine could deliver against what the hour needs.
   */
  const recovered = result.hours.map((h) =>
    convert(Math.min(h.gain + h.recoverable, Math.max(h.gain, h.loss)) / area),
  );
  const hasRecovery = result.recovery !== null;

  // Reference only. Never in `loss`, `gain` or `net` — this line moves nothing.
  const outdoor = result.hours.map((h) => (ip ? toF(h.outdoorTemperature) : h.outdoorTemperature));

  const { max, step } = niceCeiling(Math.max(...loss, ...gain) * 1.05);
  // Given the left axis's own interval count, every temperature label lands on
  // a gridline the flux axis already draws. See niceBounds.
  const temperature = niceBounds(Math.min(...outdoor), Math.max(...outdoor), Math.round(max / step));
  const x = linearScale([0, 23], [PAD.left, WIDTH - PAD.right]);
  const y = linearScale([0, max], [HEIGHT - PAD.bottom, PAD.top]);
  const yTemp = linearScale([temperature.min, temperature.max], [HEIGHT - PAD.bottom, PAD.top]);

  const points = (values: readonly number[]) => values.map((v, h) => `${x(h).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const tempPoints = outdoor.map((v, h) => `${x(h).toFixed(1)},${yTemp(v).toFixed(1)}`).join(' ');

  // Shade every run of hours where loss exceeds gain, closing each region at
  // the exact crossing rather than at the hour boundary — a region that stops
  // at 09:00 when the curves actually cross at 09:20 reads as a rounding error.
  const deficitRegions: string[] = [];
  let start: number | null = null;
  for (let h = 0; h <= 24; h++) {
    const short = h < 24 && loss[h]! > gain[h]!;
    if (short && start === null) start = h;
    if (!short && start !== null) {
      const top: string[] = [];
      const bottom: string[] = [];
      const before = crossing(x(start - 1), loss[start - 1]!, gain[start - 1]!, x(start), loss[start]!, gain[start]!);
      if (start > 0 && before) {
        top.push(`${before.x.toFixed(1)},${y(before.y).toFixed(1)}`);
        bottom.push(`${before.x.toFixed(1)},${y(before.y).toFixed(1)}`);
      }
      for (let i = start; i < h; i++) {
        top.push(`${x(i).toFixed(1)},${y(loss[i]!).toFixed(1)}`);
        bottom.push(`${x(i).toFixed(1)},${y(gain[i]!).toFixed(1)}`);
      }
      const after = h < 24 ? crossing(x(h - 1), loss[h - 1]!, gain[h - 1]!, x(h), loss[h]!, gain[h]!) : null;
      if (after) {
        top.push(`${after.x.toFixed(1)},${y(after.y).toFixed(1)}`);
        bottom.push(`${after.x.toFixed(1)},${y(after.y).toFixed(1)}`);
      }
      deficitRegions.push([...top, ...bottom.reverse()].join(' '));
      start = null;
    }
  }

  const active = hoveredHour ?? focusHour;
  const readOut = active === null ? result.hours[result.worstHour]! : result.hours[active]!;

  const hourFromEvent = (clientX: number): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    const px = ((clientX - box.left) / box.width) * WIDTH;
    if (px < PAD.left - 12 || px > WIDTH - PAD.right + 12) return null;
    const hour = Math.round(((px - PAD.left) / (WIDTH - PAD.right - PAD.left)) * 23);
    return Math.min(23, Math.max(0, hour));
  };

  return (
    <figure style={{ margin: 0 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Hourly envelope loss against internal gain. ${result.deficitHours} of 24 hours need heating.`}
        tabIndex={0}
        preserveAspectRatio="xMidYMid meet"
        /* The chart shares a row with the section and stretches to match it, so
           it takes whatever height is going rather than staying at its own
           aspect ratio and leaving a gap. */
        style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 420, touchAction: 'none' }}
        onPointerMove={(event) => onHoverHour(hourFromEvent(event.clientX))}
        onPointerLeave={() => onHoverHour(null)}
        onFocus={() => setFocusHour(result.worstHour)}
        onBlur={() => setFocusHour(null)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          setFocusHour((h) => {
            const next = Math.min(23, Math.max(0, (h ?? result.worstHour) + (event.key === 'ArrowRight' ? 1 : -1)));
            onHoverHour(next);
            return next;
          });
        }}
      >
        <defs>
          <pattern id={hatchId} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--loss)" strokeWidth="1.6" opacity="0.42" />
          </pattern>
        </defs>

        {ticksUpTo(max, step).map((value) => (
          <g key={value}>
            <line x1={PAD.left} y1={y(value)} x2={WIDTH - PAD.right} y2={y(value)} stroke="var(--border)" strokeWidth="1" />
            <text x={PAD.left - 9} y={y(value) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" fontFamily="IBM Plex Mono, monospace">
              {value % 1 === 0 ? value : value.toFixed(1)}
            </text>
          </g>
        ))}

        {ticksBetween(temperature.min, temperature.max, temperature.step).map((value) => (
          <g key={`t${value}`}>
            <line
              x1={WIDTH - PAD.right}
              y1={yTemp(value)}
              x2={WIDTH - PAD.right + 5}
              y2={yTemp(value)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={WIDTH - PAD.right + 9}
              y={yTemp(value) + 4}
              textAnchor="start"
              fontSize="11"
              fill="var(--muted)"
              fontFamily="IBM Plex Mono, monospace"
            >
              {value % 1 === 0 ? value : value.toFixed(1)}
            </text>
          </g>
        ))}

        {deficitRegions.map((pts, i) => (
          <polygon key={i} points={pts} fill={`url(#${hatchId})`} />
        ))}

        <polyline
          points={tempPoints}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="1.6"
          strokeDasharray="5 4"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.85"
        />

        {/* The recovery, as the area it fills between the passive gain and
            where that gain would reach. Drawn before the two data curves so
            they stay legible over it, and translucent so the deficit hatch it
            covers still reads underneath — the hatch is the gap, and this is
            the part of the gap a chiller could close. */}
        {hasRecovery && (
          <>
            <polygon
              points={`${points(gain)} ${points(recovered).split(' ').reverse().join(' ')}`}
              fill="var(--recover)"
              fillOpacity="0.3"
              stroke="none"
            />
            <polyline
              points={points(recovered)}
              fill="none"
              stroke="var(--recover)"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity="0.9"
            />
          </>
        )}

        <polyline points={points(gain)} fill="none" stroke="var(--gain)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={points(loss)} fill="none" stroke="var(--loss)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />

        {/* The hour under the pointer, or the worst hour at rest. */}
        <line
          x1={x(readOut.hour)}
          y1={PAD.top}
          x2={x(readOut.hour)}
          y2={HEIGHT - PAD.bottom}
          stroke={active === null ? 'var(--loss)' : 'var(--ink)'}
          strokeWidth="1.4"
          opacity={active === null ? 1 : 0.5}
        />
        <circle cx={x(readOut.hour)} cy={y(convert(readOut.loss / area))} r="4" fill="var(--loss)" />
        <circle cx={x(readOut.hour)} cy={y(convert(readOut.gain / area))} r="4" fill="var(--gain)" />

        <line x1={PAD.left} y1={HEIGHT - PAD.bottom} x2={WIDTH - PAD.right} y2={HEIGHT - PAD.bottom} stroke="var(--muted)" strokeWidth="1.4" />
        {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
          <text key={hour} x={x(hour)} y={HEIGHT - PAD.bottom + 18} textAnchor="middle" fontSize="11" fill="var(--muted)" fontFamily="IBM Plex Mono, monospace">
            {String(hour).padStart(2, '0')}
          </text>
        ))}
        <text x={(WIDTH + PAD.left - PAD.right) / 2} y={HEIGHT - 10} textAnchor="middle" fontSize="10.5" fill="var(--muted)" fontFamily="IBM Plex Mono, monospace">
          hour of the design day, local standard time · left {labels.heatFlux} · right {labels.temperature}
        </text>
      </svg>

      <figcaption
        style={{
          display: 'flex',
          gap: 18,
          flexWrap: 'wrap',
          alignItems: 'baseline',
          marginTop: 10,
          fontSize: 11,
          color: 'var(--muted)',
        }}
      >
        <Key colour="var(--loss)">envelope loss</Key>
        <Key colour="var(--gain)">internal gain</Key>
        {hasRecovery && <Key colour="var(--recover)">recovered heat</Key>}
        <Key colour="var(--muted)" dashed>outdoor air</Key>
        <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
          {String(readOut.hour).padStart(2, '0')}:00 ·{' '}
          <span style={{ color: 'var(--loss)' }}>{convert(readOut.loss / area).toFixed(1)}</span> loss ·{' '}
          <span style={{ color: 'var(--gain)' }}>{convert(readOut.gain / area).toFixed(1)}</span> gain ·{' '}
          <span style={{ color: readOut.net < 0 ? 'var(--loss)' : 'var(--gain)' }}>
            {readOut.net < 0 ? '−' : '+'}
            {Math.abs(convert(readOut.net / area)).toFixed(1)}
          </span>{' '}
          {labels.heatFlux} ·{' '}
          <span style={{ color: 'var(--muted)' }}>
            {outdoor[readOut.hour]!.toFixed(1)} {labels.temperature} out
          </span>
          {active === null && ' · worst hour'}
        </span>
      </figcaption>
    </figure>
  );
}

function Key({ colour, dashed = false, children }: { colour: string; dashed?: boolean; children: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {/* The dashed key is drawn as an SVG rather than a border, so it matches
          the line on the chart dash for dash instead of approximating it. */}
      {dashed ? (
        <svg width="18" height="3" viewBox="0 0 18 3" style={{ display: 'inline-block', overflow: 'visible' }}>
          <line x1="0" y1="1.5" x2="18" y2="1.5" stroke={colour} strokeWidth="1.6" strokeDasharray="5 4" />
        </svg>
      ) : (
        <span style={{ width: 18, height: 3, background: colour, display: 'inline-block' }} />
      )}
      {children}
    </span>
  );
}
