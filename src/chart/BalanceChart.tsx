import { useId, useRef, useState } from 'react';

import type { BalanceResult } from '../engine/balance';
import type { UnitSystem } from '../model/types';
import { LABELS, toBtuHFt2, toF } from '../model/units';
import {
  crossing,
  linearScale,
  niceBounds,
  niceCeiling,
  signedBounds,
  ticksAcross,
  ticksBetween,
  ticksUpTo,
} from './scales';
import { seriesFrom } from './series';
import { useWidth } from './useWidth';

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
 *
 * ## The detailed view
 *
 * `detailed` replaces the two curves with one line per component — every loss
 * term and every gain term, in its own hue. It is off by default and does not
 * persist, because the simple chart is the one that answers the question and
 * the breakdown is for someone who has already read the answer and wants to
 * know what made it.
 *
 * **It subtracts as much as it adds.** The deficit hatch, the outdoor-air line
 * and the recovery band all go, and the right-hand axis with them. Nine lines
 * plus a hatched region plus a dashed reference on a second scale is not a
 * denser chart, it is an unreadable one — and each of those three answers a
 * question this view is not being asked. What stays is the two totals, drawn
 * heavier than the components, so the answer never leaves the screen while you
 * are reading the parts and every component visibly sums to a line you can see.
 *
 * **And it is SIGNED.** Gains above zero, losses below, following the
 * convention the rest of the tool already uses for a net. On a single-sided
 * axis a reader has to consult a legend to learn whether a rising line is the
 * building warming or cooling; across a zero rule, direction is the first thing
 * they see and the legend is only for identity. The totals are signed too —
 * drawing the components of the loss below zero and their sum above it would
 * be the chart contradicting itself.
 *
 * The price is real and worth stating: on the simple chart the vertical gap
 * between the two curves IS the deficit, and across a zero line it is not. The
 * numeric readout carries the net instead, and the simple view — which is the
 * one that answers the question — is one button away.
 */

const STANDARD_WIDTH = 880;
/**
 * 560, not 380.
 *
 * The chart shares a row with the section drawing and stretches to its height.
 * At the old aspect it rendered 266 px tall in a 549 px panel and left half the
 * box empty. Taller is also simply better here: the reading is the GAP between
 * two curves, and vertical resolution is what makes that gap legible. Text is
 * unaffected — the horizontal scale sets the type size, and that has not moved.
 */
const STANDARD_HEIGHT = 560;
/** `right` is 52, not 20: the outdoor-temperature axis and its labels live there. */
const STANDARD_PAD = { top: 22, right: 52, bottom: 46, left: 54 };

/**
 * The two layouts: one drawing, sized two ways.
 *
 * The standard one is 880 wide and scales with its box, which on a desk is
 * about 1:1 and on a phone is 0.4 — so its 11-unit ticks rendered at 4.5 px.
 * Scaling a desktop picture down is not a phone layout.
 *
 * The compact one is drawn at the width it is SHOWN at, so a unit is a pixel
 * and the type is the size it says. It is taller for its width, because the
 * reading is the vertical gap between two curves and a phone has height to
 * spare; its margins are tighter, and it ticks every six hours instead of
 * three, because eight labels do not fit across 330 px of plot.
 *
 * Nothing about the data changes between them, and the export always takes the
 * standard one — see useWidth.
 */
interface Layout {
  readonly width: number;
  readonly height: number;
  readonly pad: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly hourTicks: readonly number[];
  readonly compact: boolean;
}

const STANDARD: Layout = {
  width: STANDARD_WIDTH,
  height: STANDARD_HEIGHT,
  pad: STANDARD_PAD,
  hourTicks: [0, 3, 6, 9, 12, 15, 18, 21],
  compact: false,
};

function compactLayout(width: number): Layout {
  return {
    width,
    // 0.85 of the width, held between a height that still shows the gap and
    // one that leaves the readout on the same screen as the curves.
    height: Math.min(380, Math.max(260, Math.round(width * 0.85))),
    // Bottom carries two caption lines rather than one: the axis sentence is
    // 390 px of mono at this size and the plot is not.
    pad: { top: 16, right: 40, bottom: 58, left: 40 },
    hourTicks: [0, 6, 12, 18],
    compact: true,
  };
}

/*
 * A key was drawn inside the SVG here for one revision, so that an exported
 * PNG could be read without the HTML table beside the live chart. It was
 * withdrawn: it took 130 px of reserved right margin, and it took them from
 * every viewing of the chart on the site to serve an export that happens
 * rarely. The live chart is the primary case and it wins.
 *
 * An unlabelled PNG is the accepted cost, not an oversight. If it ever needs
 * solving, the answer is to build the key into the EXPORT CLONE rather than
 * into the chart — the clone is already walked and rewritten in exportPng.ts,
 * and nothing it adds there costs the page a pixel.
 */

export interface BalanceChartProps {
  readonly result: BalanceResult;
  readonly floorArea: number;
  readonly units: UnitSystem;
  readonly hoveredHour: number | null;
  readonly onHoverHour: (hour: number | null) => void;
  /** One line per component instead of the two totals alone. Never default. */
  readonly detailed?: boolean;
}

export function BalanceChart({
  result,
  floorArea,
  units,
  hoveredHour,
  onHoverHour,
  detailed = false,
}: BalanceChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const figureRef = useRef<HTMLElement>(null);
  const measured = useWidth(figureRef);
  const layout = measured.compact ? compactLayout(measured.width) : STANDARD;
  const { width: WIDTH, height: HEIGHT, pad: PAD } = layout;
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

  // Components are each a part of a total, so the totals still set the axis.
  const { max, step } = niceCeiling(Math.max(...loss, ...gain) * 1.05);
  // Signed: losses run below zero, so the axis has to hold both directions.
  const signed = signedBounds(-Math.max(...loss) * 1.05, Math.max(...gain) * 1.05);
  // Given the left axis's own interval count, every temperature label lands on
  // a gridline the flux axis already draws. See niceBounds.
  const temperature = niceBounds(Math.min(...outdoor), Math.max(...outdoor), Math.round(max / step));
  // 20, not PAD.right: the temperature axis is gone in this view and its
  // margin goes back to the plot.
  const padRight = detailed ? 20 : PAD.right;
  const series = detailed ? seriesFrom(result.hours, (watts) => convert(watts / area)) : [];
  const x = linearScale([0, 23], [PAD.left, WIDTH - padRight]);
  const y = detailed
    ? linearScale([signed.min, signed.max], [HEIGHT - PAD.bottom, PAD.top])
    : linearScale([0, max], [HEIGHT - PAD.bottom, PAD.top]);
  /** Where zero sits. The baseline in the simple view; a rule inside it here. */
  const zero = detailed ? y(0) : HEIGHT - PAD.bottom;
  // The loss total follows its own components below the line. Drawing them
  // below zero and their sum above it would be the chart contradicting itself.
  const lossLine = detailed ? loss.map((v) => -v) : loss;
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
    <figure ref={figureRef} style={{ margin: 0 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        data-layout={layout.compact ? 'compact' : 'standard'}
        role="img"
        aria-label={
          detailed
            ? `Hourly envelope loss against internal gain, broken down into ${series.length} components. ${result.deficitHours} of 24 hours need heating.`
            : `Hourly envelope loss against internal gain. ${result.deficitHours} of 24 hours need heating.`
        }
        tabIndex={0}
        preserveAspectRatio="xMidYMid meet"
        /* The chart shares a row with the section and stretches to match it, so
           it takes whatever height is going rather than staying at its own
           aspect ratio and leaving a gap.
 
           The detailed view was capped lower than this for one revision, to
           keep its readout table inside the one-screen budget. That is also
           withdrawn: the live chart is the primary case, and 40 px of drawing
           on every viewing is a worse trade than the verdict sitting a few
           pixels below the fold on the one configuration that reaches it —
           eleven components, which needs both an exposed floor and air-cooled
           IT. The budget is a promise about the SIMPLE view, which is the one
           that answers the question. */
        /* pan-y, not none. `none` made the chart a 300 px patch of a phone
           screen that the page could not be scrolled through; pan-y leaves the
           vertical swipe to the page and gives a sideways one to the scrub. */
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          maxHeight: layout.compact ? undefined : 420,
          touchAction: 'pan-y',
        }}
        onPointerMove={(event) => onHoverHour(hourFromEvent(event.clientX))}
        // A finger has no hover: without this the drawing would not follow it
        // until it had moved, and a tap would show nothing at all.
        onPointerDown={(event) => onHoverHour(hourFromEvent(event.clientX))}
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

        {(detailed ? ticksAcross(signed.min, signed.max, signed.step) : ticksUpTo(max, step)).map((value) => (
          <g key={value}>
            <line x1={PAD.left} y1={y(value)} x2={WIDTH - padRight} y2={y(value)} stroke="var(--border)" strokeWidth="1" />
            <text x={PAD.left - 9} y={y(value) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" fontFamily="IBM Plex Mono, monospace">
              {value % 1 === 0 ? value : value.toFixed(1)}
            </text>
          </g>
        ))}

        {!detailed && ticksBetween(temperature.min, temperature.max, temperature.step).map((value) => (
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

        {!detailed && deficitRegions.map((pts, i) => (
          <polygon key={i} points={pts} fill={`url(#${hatchId})`} />
        ))}

        {!detailed && <polyline
          points={tempPoints}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="1.6"
          strokeDasharray="5 4"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.85"
        />}

        {/* One line per component, under the totals. Thinner and slightly
            translucent, so where several cross the two totals stay the
            strongest marks on the chart. */}
        {series.map((one) => (
          <polyline
            key={one.slot}
            points={points(one.values)}
            fill="none"
            stroke={one.colour}
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.9"
          />
        ))}

        {/* The recovery, as the area it fills between the passive gain and
            where that gain would reach. Drawn before the two data curves so
            they stay legible over it, and translucent so the deficit hatch it
            covers still reads underneath — the hatch is the gap, and this is
            the part of the gap a chiller could close. */}
        {hasRecovery && !detailed && (
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
        <polyline points={points(lossLine)} fill="none" stroke="var(--loss)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />

        {/* The zero rule, drawn over the data. It is the reading this view is
            built on — which side of it a line sits on — so it is a stronger
            mark than a gridline and weaker than a curve. */}
        {detailed && (
          <line x1={PAD.left} y1={zero} x2={WIDTH - padRight} y2={zero} stroke="var(--ink)" strokeWidth="1.2" opacity="0.55" />
        )}

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
        <circle cx={x(readOut.hour)} cy={y(convert((detailed ? -readOut.loss : readOut.loss) / area))} r="4" fill="var(--loss)" />
        <circle cx={x(readOut.hour)} cy={y(convert(readOut.gain / area))} r="4" fill="var(--gain)" />

        <line x1={PAD.left} y1={HEIGHT - PAD.bottom} x2={WIDTH - padRight} y2={HEIGHT - PAD.bottom} stroke="var(--muted)" strokeWidth="1.4" />
        {layout.hourTicks.map((hour) => (
          <text key={hour} x={x(hour)} y={HEIGHT - PAD.bottom + 18} textAnchor="middle" fontSize="11" fill="var(--muted)" fontFamily="IBM Plex Mono, monospace">
            {String(hour).padStart(2, '0')}
          </text>
        ))}
        {layout.compact ? (
          <text textAnchor="middle" fontSize="10.5" fill="var(--muted)" fontFamily="IBM Plex Mono, monospace">
            <tspan x={(WIDTH + PAD.left - padRight) / 2} y={HEIGHT - 24}>
              hour of the design day, local standard time
            </tspan>
            <tspan x={(WIDTH + PAD.left - padRight) / 2} y={HEIGHT - 9}>
              {labels.heatFlux}
              {!detailed && ` · right ${labels.temperature}`}
            </tspan>
          </text>
        ) : (
          <text x={(WIDTH + PAD.left - padRight) / 2} y={HEIGHT - 10} textAnchor="middle" fontSize="10.5" fill="var(--muted)" fontFamily="IBM Plex Mono, monospace">
            hour of the design day, local standard time · {labels.heatFlux}
            {!detailed && ` · right ${labels.temperature}`}
          </text>
        )}
      </svg>

      {/* The legend is a READOUT here, not a key.
 
          Eleven names and eleven numbers wrapped as inline items line up with
          nothing: the reader is comparing magnitudes, and magnitudes compared
          down a ragged column are magnitudes not compared. So it becomes a
          grid — swatch, name, value — where every cell shares a column and
          every number is right-aligned against the next.
 
          The values are the hour under the pointer, or the worst hour at rest,
          which is the same hour the section drawing and the playheads are
          already showing. Nothing here introduces a second idea of "now". */}
      {detailed && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(178px, 1fr))',
            columnGap: 20,
            rowGap: 3,
            marginTop: 10,
            fontSize: 11,
            color: 'var(--muted)',
          }}
        >
          <Reading colour="var(--loss)" label="envelope loss" value={-convert(readOut.loss / area)} heavy />
          <Reading colour="var(--gain)" label="internal gain" value={convert(readOut.gain / area)} heavy />
          {series.map((one) => (
            <Reading
              key={one.slot}
              colour={one.colour}
              label={one.label.toLowerCase()}
              value={one.values[readOut.hour] ?? 0}
            />
          ))}
        </div>
      )}

      <figcaption
        style={{
          display: 'flex',
          // columnGap, not gap: React warns on a rerender that mixes a
          // shorthand with a longhand for the same property, and `gap` beside
          // `rowGap` is exactly that. Same trap as the border shorthand on the
          // gross-floor cell in EnvelopePanel.
          columnGap: 18,
          rowGap: 5,
          flexWrap: 'wrap',
          alignItems: 'baseline',
          marginTop: 10,
          fontSize: 11,
          color: 'var(--muted)',
        }}
      >
        {!detailed && <Key colour="var(--loss)" heavy>envelope loss</Key>}
        {!detailed && <Key colour="var(--gain)" heavy>internal gain</Key>}
        {hasRecovery && !detailed && <Key colour="var(--recover)">recovered heat</Key>}
        {!detailed && <Key colour="var(--muted)" dashed>outdoor air</Key>}
        {detailed && (
          <span style={{ color: 'var(--muted)' }}>
            gains above the line, losses below · {labels.heatFlux}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
          {String(readOut.hour).padStart(2, '0')}:00 ·{' '}
          <span style={{ color: 'var(--loss)' }}>{convert(readOut.loss / area).toFixed(1)}</span> loss ·{' '}
          <span style={{ color: 'var(--gain)' }}>{convert(readOut.gain / area).toFixed(1)}</span> gain ·{' '}
          <span style={{ color: readOut.net < 0 ? 'var(--loss)' : 'var(--gain)' }}>
            {readOut.net < 0 ? '−' : '+'}
            {Math.abs(convert(readOut.net / area)).toFixed(1)}
          </span>{' '}
          {/* "delta", because the figure is a DIFFERENCE between two of the
              numbers beside it and read without a label it looks like a third
              quantity of the same kind. */}
          {labels.heatFlux} delta ·{' '}
          <span style={{ color: 'var(--muted)' }}>
            {outdoor[readOut.hour]!.toFixed(1)} {labels.temperature} air temperature
          </span>
          {active === null && ' · worst hour'}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * One row of the detailed readout: swatch, name, value.
 *
 * A three-column grid rather than a flex row, so the name column and the
 * number column line up across every cell of the outer grid — which is the
 * whole reason this stopped being a legend.
 */
function Reading({
  colour,
  label,
  value,
  heavy = false,
}: {
  colour: string;
  label: string;
  value: number;
  heavy?: boolean;
}) {
  return (
    <span
      style={{
        display: 'grid',
        gridTemplateColumns: '18px 1fr auto',
        alignItems: 'center',
        gap: 7,
        color: heavy ? 'var(--body)' : 'var(--muted)',
      }}
    >
      <span style={{ width: 18, height: heavy ? 3 : 2, background: colour, display: 'inline-block' }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {/* Tabular figures and an explicit sign on both directions: a column
          where only the negatives carry a mark reads as a column of magnitudes
          with some typos in it. */}
      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>
        {value > 0 ? '+' : value < 0 ? '−' : ''}
        {Math.abs(value).toFixed(2)}
      </span>
    </span>
  );
}

function Key({
  colour,
  dashed = false,
  heavy = false,
  children,
}: {
  colour: string;
  dashed?: boolean;
  /** The two totals, which are drawn thicker on the chart and here. */
  heavy?: boolean;
  children: string;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {/* The dashed key is drawn as an SVG rather than a border, so it matches
          the line on the chart dash for dash instead of approximating it. */}
      {dashed ? (
        <svg width="18" height="3" viewBox="0 0 18 3" style={{ display: 'inline-block', overflow: 'visible' }}>
          <line x1="0" y1="1.5" x2="18" y2="1.5" stroke={colour} strokeWidth="1.6" strokeDasharray="5 4" />
        </svg>
      ) : (
        <span style={{ width: 18, height: heavy ? 3 : 2, background: colour, display: 'inline-block' }} />
      )}
      {children}
    </span>
  );
}
