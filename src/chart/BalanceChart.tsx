import { useId, useRef, useState } from 'react';

import type { BalanceResult } from '../engine/balance';
import { PASSIVE_HOUSE_BENCHMARK_W_M2 } from '../engine/balance';
import type { UnitSystem } from '../model/types';
import { LABELS, toBtuHFt2 } from '../model/units';
import { crossing, linearScale, niceCeiling, ticksUpTo } from './scales';

/**
 * The 24-hour balance.
 *
 * Loss against gain, hour by hour, with every hour the building is short shaded
 * between the two curves. The Passive House 10 W/m² line is drawn for context
 * and labelled as a rough benchmark — never as a gate.
 *
 * Hovering emits the hour, which the section drawing then redraws to. That one
 * interaction is what makes the two halves a single tool rather than two panels
 * sharing a screen.
 */

const WIDTH = 880;
const HEIGHT = 380;
const PAD = { top: 22, right: 20, bottom: 46, left: 54 };

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
  const benchmark = convert(PASSIVE_HOUSE_BENCHMARK_W_M2);

  const { max, step } = niceCeiling(Math.max(...loss, ...gain, benchmark) * 1.05);
  const x = linearScale([0, 23], [PAD.left, WIDTH - PAD.right]);
  const y = linearScale([0, max], [HEIGHT - PAD.bottom, PAD.top]);

  const points = (values: readonly number[]) => values.map((v, h) => `${x(h).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

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
        style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none' }}
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

        {deficitRegions.map((pts, i) => (
          <polygon key={i} points={pts} fill={`url(#${hatchId})`} />
        ))}

        {/* The Passive House reference. A benchmark, not a gate — which is why
            it is a hairline in a neutral colour rather than a threshold. */}
        <line
          x1={PAD.left}
          y1={y(benchmark)}
          x2={WIDTH - PAD.right}
          y2={y(benchmark)}
          stroke="var(--muted)"
          strokeWidth="1.4"
          strokeDasharray="7 5"
        />
        <text x={WIDTH - PAD.right} y={y(benchmark) - 7} textAnchor="end" fontSize="10.5" fill="var(--muted)" fontFamily="IBM Plex Mono, monospace">
          Passive House {ip ? '3.2 Btu/h·ft²' : '10 W/m²'} — a rough benchmark, not a pass mark
        </text>

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
          hour of the design day, local standard time · {labels.heatFlux}
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
        <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
          {String(readOut.hour).padStart(2, '0')}:00 ·{' '}
          <span style={{ color: 'var(--loss)' }}>{convert(readOut.loss / area).toFixed(1)}</span> loss ·{' '}
          <span style={{ color: 'var(--gain)' }}>{convert(readOut.gain / area).toFixed(1)}</span> gain ·{' '}
          <span style={{ color: readOut.net < 0 ? 'var(--loss)' : 'var(--gain)' }}>
            {readOut.net < 0 ? '−' : '+'}
            {Math.abs(convert(readOut.net / area)).toFixed(1)}
          </span>{' '}
          {labels.heatFlux}
          {active === null && ' · worst hour'}
        </span>
      </figcaption>
    </figure>
  );
}

function Key({ colour, children }: { colour: string; children: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 18, height: 3, background: colour, display: 'inline-block' }} />
      {children}
    </span>
  );
}
