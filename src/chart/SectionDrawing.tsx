import { useId } from 'react';

import { GROUND_LINES, PERSON_HEADS } from '../model/buildingTypes';
import type { BuildingType, SurfaceSlot } from '../model/types';
import { arrowGeometry, SHAFT_LENGTH } from './arrowScale';

/**
 * The section drawing.
 *
 * Renders whichever `BuildingType` record it is handed — that indirection is
 * the whole point, because v2's five extra massings then need no change here.
 *
 * Every colour is a token, so the light and dark canvases are one drawing.
 *
 * The sketch filter — feTurbulence into feDisplacementMap, roughening the shell
 * to look hand-drawn — is off by default and has no control. Patrick used it
 * for a few days and every massing reads better without it. The filter stays in
 * the code because it still works and the prop still switches it; nothing in
 * the UI turns it on.
 */

export interface SectionTerm {
  readonly slot: SurfaceSlot;
  readonly label: string;
  readonly watts: number;
}

export interface SectionDrawingProps {
  readonly type: BuildingType;
  readonly terms: readonly SectionTerm[];
  /** Shared across all 24 hours — see arrowScale.ts. */
  readonly reference: number | null;
  readonly sketch?: boolean;
  readonly showLabels?: boolean;
  readonly selected?: SurfaceSlot | null;
  readonly onSelect?: (slot: SurfaceSlot) => void;
}

const LOSS_SLOTS = new Set<SurfaceSlot>([
  'loss-walls',
  'loss-windows',
  'loss-roof',
  'loss-ground-floor',
  'loss-exposed-floor',
]);

/**
 * Where every label sits, as a fixed offset from its own anchor.
 *
 * It used to be parked past the arrowhead at `SHAFT_LENGTH * scale + 18`, so it
 * swung 44 to 220 units outward as the value changed and was cut off by the
 * massing's crop exactly when the arrow was biggest. Pinning it at the far end
 * instead fixed the clipping but broke the connection: a small loss drew a
 * stub of an arrow with its name stranded 200 units away.
 *
 * So every label now sits at the arrow's START, against the building, below or
 * beside the line. The arrow grows away from its label rather than towards it,
 * the name stays attached to the surface it belongs to at any value, and the
 * drawing stays tight instead of sprawling to its longest possible arrow.
 *
 * The offsets are the same for all six massings because the slot, not the
 * building, decides which side is clear: a wall arrow always leaves to the
 * left, a roof arrow always leaves upward.
 */
export type Placement = { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' };

/**
 * A loss label follows the arrow's DIRECTION, not its slot.
 *
 * Keying this on the slot looked fine on the office and was wrong on the
 * school, which mirrors it: there the wall arrow leaves to the right and the
 * window arrow to the left. The label went to the wrong side of both. The
 * direction is in the data, so read it from there.
 *
 * Two things decide every placement: the label must be OUTSIDE the building,
 * and it must be clear of its own shaft. For the horizontal and vertical
 * arrows one offset satisfies both. For the 45° arrows they pull apart, and
 * which one wins depends on where the building is:
 *
 *   down-diagonal  the soil is open, so the label sits on the arrow's own side
 *                  and drops below the shaft. The two floor arrows lean to
 *                  opposite sides, so their labels run away from each other
 *                  instead of meeting under the middle of the slab.
 *   up-diagonal    below is the roof, so the label cannot drop. It crosses to
 *                  the far side of the anchor instead, where the shaft is not.
 *                  Only the roof arrow points up, so nothing is there to hit.
 */
export function lossPlacement(rotate: number, slot: string): Placement {
  const radians = (rotate * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  // Diagonal: both components carry weight, so neither rule below applies.
  if (Math.abs(cos) > 0.3 && Math.abs(sin) > 0.3) {
    const right = cos > 0;
    return sin > 0
      ? { dx: right ? 14 : -14, dy: 30, anchor: right ? 'start' : 'end' }
      : { dx: right ? -14 : 14, dy: -14, anchor: right ? 'end' : 'start' };
  }

  if (cos > 0.3) return { dx: 8, dy: 20, anchor: 'start' };
  if (cos < -0.3) return { dx: -8, dy: 20, anchor: 'end' };
  // Dead vertical. Both floor arrows point down, so they take opposite sides of
  // their own anchors and cannot run into one another.
  const side = slot === 'loss-exposed-floor' ? -1 : 1;
  return sin > 0
    ? { dx: 14 * side, dy: 20, anchor: side > 0 ? 'start' : 'end' }
    : { dx: 14 * side, dy: -8, anchor: side > 0 ? 'start' : 'end' };
}

/** Gains sit beside their glyph, since a gain arrow points up into the space. */
const GAIN_LABEL: Record<string, Placement> = {
  'gain-people': { dx: -30, dy: 6, anchor: 'end' },
  'gain-lighting': { dx: 28, dy: 5, anchor: 'start' },
  // Misc above its box and IT below its rack: the two glyphs sit side by side
  // and their labels are long, so they are separated vertically or not at all.
  'gain-misc-equipment': { dx: 0, dy: -26, anchor: 'middle' },
  'gain-it-equipment': { dx: 0, dy: 42, anchor: 'middle' },
};

/**
 * Per-massing corrections, where a building's own geometry defeats the rule.
 *
 * The school is low and wide and its plant sits shoulder to shoulder, so the
 * person and the equipment box are 65 units apart where the office gives them
 * 181. Their labels are wider than that gap and have to be pulled apart by
 * hand; everything else the direction rule handles.
 */
const OVERRIDES: Record<string, Record<string, Placement>> = {
  school: {
    'gain-people': { dx: 4, dy: 34, anchor: 'middle' },
    // Below its box, not above: the school window arrow leaves to the LEFT and
    // its label sits where misc equipment would otherwise go.
    'gain-misc-equipment': { dx: -14, dy: 34, anchor: 'end' },
    'gain-it-equipment': { dx: 14, dy: -24, anchor: 'start' },
  },
};

/** The 88-unit shaft, drawn twice with opposite curvature so arrows alternate. */
const SHAFT_A = 'M0 0 C 22 -5 44 4 64 -2 L 88 0';
const SHAFT_B = 'M0 0 C 22 4 44 -5 64 2 L 88 0';
const HEAD = 'M6 0 L -16 -11 L -10 0 L -16 11 Z';

export function SectionDrawing({
  type,
  terms,
  reference,
  sketch = false,
  showLabels = true,
  selected = null,
  onSelect,
}: SectionDrawingProps) {
  // Ids must be unique per instance: the export clone mounts a second copy of
  // this drawing, and a duplicate filter id would have one steal the other's.
  const uid = useId().replace(/:/g, '');
  const sketchId = `hb-sketch-${uid}`;
  const soilId = `hb-soil-${uid}`;
  const gridId = `hb-grid-${uid}`;

  const bySlot = new Map(terms.map((t) => [t.slot, t]));

  return (
    <svg
      viewBox={type.viewBox}
      role="img"
      aria-label={`${type.label} section: envelope heat loss against internal heat gain`}
      preserveAspectRatio="xMidYMid meet"
      /* Without a cap the drawing is sized by the panel's width, which on a
         900 px screen pushes the verdict below the fold. The cap is therefore
         set by the fold budget and nothing else, and it is what makes the
         drawing HEIGHT-bound: at 628 px wide the box could scale the artwork by
         0.61 and the cap allows 0.40, so every unit of viewBox height the crop
         does not need is a unit of size the building gets back.

         That is why the vertical arrows were re-aimed to 45° — the crop went
         from 770 units tall to 632 — and why this number is 250 rather than the
         232 it sat at before. Together with the fold the box-fields row gave
         back when it stopped wrapping to three lines, they draw the building
         47% larger and still leave the verdict above 900 px. */
      style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 280 }}
    >
      <defs>
        <filter id={sketchId} x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="3" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <pattern id={soilId} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="16" stroke="var(--soil)" strokeWidth="1.1" />
        </pattern>
        <pattern id={gridId} width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0 L0 0 L0 40" fill="none" stroke="var(--grid)" strokeWidth="1" />
        </pattern>
      </defs>

      <rect x="-120" y="-60" width="1000" height="860" fill={`url(#${gridId})`} />

      {/* The shell carries the sketch filter; the arrows deliberately do not. */}
      <g filter={sketch ? `url(#${sketchId})` : undefined} strokeLinecap="round" strokeLinejoin="round">
        {type.soil.map((rect, i) => (
          <rect key={i} {...rect} fill={`url(#${soilId})`} opacity="0.8" />
        ))}
        <path d={GROUND_LINES[type.id]} fill="none" stroke="var(--ground-line)" strokeWidth="2.2" />

        <g stroke="var(--ink)" strokeWidth="2.8" fill="var(--massing-fill)" fillOpacity="var(--massing-fill-opacity)">
          {type.shell.map((path, i) => (
            <path
              key={i}
              d={path.d}
              fill={i === 0 ? 'var(--massing-fill)' : 'none'}
              fillOpacity={i === 0 ? 'var(--massing-fill-opacity)' : undefined}
              strokeWidth={path.role === 'floor-line' ? 1.4 : path.role === 'aperture' ? 2.4 : 2.8}
              opacity={path.role === 'floor-line' ? 0.48 : 1}
            />
          ))}
        </g>

        <g stroke="var(--gain)" fill="none" strokeWidth="2.2">
          <circle cx={PERSON_HEADS[type.id].cx} cy={PERSON_HEADS[type.id].cy} r={PERSON_HEADS[type.id].r} />
          {type.glyphs.map((g, i) => (
            <path key={i} d={g.d} strokeWidth={g.role === 'glyph-light' ? 1.4 : 2.2} />
          ))}
        </g>
      </g>

      {type.anchors.map((anchor) => {
        const term = bySlot.get(anchor.slot);
        if (!term) return null;

        const geometry = arrowGeometry(term.watts, reference);
        // A zero term draws NOTHING. Not a stub, not a ghost.
        if (!geometry.visible) return null;

        const isLoss = LOSS_SLOTS.has(anchor.slot);
        const colour = isLoss ? 'var(--loss)' : 'var(--gain)';
        const isSelected = selected === anchor.slot;
        const alternate = anchor.x % 2 === 0;

        return (
          <g
            key={anchor.slot}
            data-surface={anchor.slot}
            transform={`translate(${anchor.x},${anchor.y}) rotate(${anchor.rotate})`}
            stroke={colour}
            fill={colour}
            opacity={selected && !isSelected ? 0.35 : 1}
            style={onSelect ? { cursor: 'pointer' } : undefined}
            onClick={onSelect ? () => onSelect(anchor.slot) : undefined}
          >
            {/* A generous invisible target: the shaft alone is a few pixels
                tall and would be a miserable thing to click. */}
            {onSelect && (
              <rect
                x="-8"
                y="-16"
                width={SHAFT_LENGTH * geometry.scale + 24}
                height="32"
                fill="transparent"
                stroke="none"
              />
            )}
            <g transform={`scale(${geometry.scale.toFixed(4)},1)`}>
              <path
                d={alternate ? SHAFT_A : SHAFT_B}
                fill="none"
                vectorEffect="non-scaling-stroke"
                strokeWidth={geometry.strokeWidth.toFixed(2)}
              />
            </g>
            <g transform={`translate(${SHAFT_LENGTH},0)`}>
              <g transform={`translate(${geometry.tipOffset.toFixed(1)},0)`}>
                {/* Uniform, so the head grows without distorting. */}
                <g transform={`scale(${geometry.headScale.toFixed(3)})`}>
                  <path d={HEAD} stroke="none" />
                </g>
              </g>
            </g>
          </g>
        );
      })}

      {showLabels && (
        <g
          fontFamily="IBM Plex Mono, monospace"
          fontSize="13"
          letterSpacing="1.4"
          stroke="var(--label-halo)"
          strokeWidth="5"
          paintOrder="stroke"
        >
          {type.anchors.map((anchor) => {
            const term = bySlot.get(anchor.slot);
            if (!term || !arrowGeometry(term.watts, reference).visible) return null;
            const isLoss = LOSS_SLOTS.has(anchor.slot);

            // Nothing here reads the arrow's length.
            const placement: Placement =
              OVERRIDES[type.id]?.[anchor.slot] ??
              GAIN_LABEL[anchor.slot] ??
              lossPlacement(anchor.rotate, anchor.slot);
            const x = anchor.x + placement.dx;
            const y = anchor.y + placement.dy;
            return (
              <text
                key={anchor.slot}
                x={x}
                y={y}
                textAnchor={placement.anchor}
                fill={isLoss ? 'var(--loss)' : 'var(--gain)'}
              >
                {term.label.toUpperCase()}
              </text>
            );
          })}
        </g>
      )}
    </svg>
  );
}
