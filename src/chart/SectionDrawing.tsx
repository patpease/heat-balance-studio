import { useId, useRef } from 'react';

import { GROUND_LINES, PERSON_HEADS } from '../model/buildingTypes';
import type { BuildingType, SurfaceSlot } from '../model/types';
import { arrowGeometry, SHAFT_LENGTH } from './arrowScale';
import { useWidth } from './useWidth';

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
  /**
   * Where the artwork sits in a box wider than it needs.
   *
   * The drawing is HEIGHT-bound — see the cap below — so a 628 px box renders
   * 377 px of building and 125 px of nothing at each side. Centred, that
   * nothing is unusable. Pushed to one edge it becomes a single contiguous
   * margin, and the dimension fields sit in it — which is what took a row off
   * the envelope panel without shrinking the building.
   */
  readonly align?: 'centre' | 'left' | 'right';
  /**
   * Words beside the arrows, or numbered markers keyed elsewhere.
   *
   * The labels are 13 units in a 1,028-unit drawing, which on a phone is about
   * 4 px — and at a size that could be read they would collide with the
   * building. `markers` puts a numbered dot where each label sits instead,
   * drawn at a fixed size ON SCREEN rather than in drawing units, and the
   * envelope panel prints the key. See `markerNumbers` for the numbering.
   */
  readonly labelMode?: 'text' | 'markers';
}

/**
 * The order markers are numbered in.
 *
 * The envelope table's own order — five surfaces, then ventilation, then
 * infiltration — and the gains after it, so the numbers down the cards run
 * 1, 2, 3 without a jump. Fixed rather than read off the massing, whose anchor
 * order is whatever the canvas happened to draw first.
 */
export const MARKER_ORDER: readonly SurfaceSlot[] = [
  'loss-walls',
  'loss-windows',
  'loss-roof',
  'loss-ground-floor',
  'loss-exposed-floor',
  'loss-ventilation',
  'loss-infiltration',
  'gain-people',
  'gain-lighting',
  'gain-misc-equipment',
  'gain-it-equipment',
];

/**
 * Which number each drawn arrow carries.
 *
 * Only arrows that are DRAWN are numbered, counting in MARKER_ORDER. A zero
 * term draws nothing (see the anchors below), and a number with no arrow would
 * send the reader looking for one — so an office with no exposed floor runs
 * 1–4 and then 5 is ventilation, rather than skipping a number that means
 * nothing on this building. The panel reads the same map for its cards and
 * its key, so the two cannot disagree.
 */
export function markerNumbers(
  type: BuildingType,
  terms: readonly SectionTerm[],
  reference: number | null,
): Map<SurfaceSlot, number> {
  const anchored = new Set(type.anchors.map((anchor) => anchor.slot));
  const drawn = new Map(terms.map((term) => [term.slot, term]));
  const numbers = new Map<SurfaceSlot, number>();
  for (const slot of MARKER_ORDER) {
    const term = drawn.get(slot);
    if (!term || !anchored.has(slot) || !arrowGeometry(term.watts, reference).visible) continue;
    numbers.set(slot, numbers.size + 1);
  }
  return numbers;
}

function closestOnSegment(
  point: { x: number; y: number },
  segment: { x1: number; y1: number; x2: number; y2: number },
): { x: number; y: number } {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSquared));
  return { x: segment.x1 + t * dx, y: segment.y1 + t * dy };
}

function normalOf(segment: { x1: number; y1: number; x2: number; y2: number }): [number, number] {
  const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) || 1;
  return [-(segment.y2 - segment.y1) / length, (segment.x2 - segment.x1) / length];
}

/** Marker diameter and numeral size, in CSS pixels. */
const MARKER_PX = 20;
const MARKER_FONT_PX = 11;

export interface MarkerSpot {
  readonly slot: SurfaceSlot;
  readonly x: number;
  readonly y: number;
}

/**
 * Where each marker sits: just past its own arrowhead.
 *
 * Not where the label sat. The labels are placed against the building so the
 * name stays attached to its surface at any arrow length — but a 20 px dot is
 * far taller than 13 units of text, and on the office's left wall the
 * ventilation and infiltration labels sit one line apart, so their dots landed
 * on each other and on the ventilation shaft. Past the head, a dot reads as a
 * callout on the arrow it numbers, and two arrows leaving the same wall at
 * different lengths end in different places.
 *
 * Two corrections follow, both measured in drawing units:
 *
 *   - clamped inside the viewBox, because the crop is cut to the longest arrow
 *     and a dot beyond that arrow's head would be cut in half;
 *   - stepped sideways off any OTHER arrow it lands on. Ventilation and
 *     infiltration leave the same wall at the same angle, so the short one's
 *     dot ends up on the long one's shaft; moving it further out along its own
 *     line would only slide it along the other arrow, so it moves across it;
 *   - pushed apart where two dots still touch, the LATER one moving further
 *     out along its own arrow, so the one it moves is never pushed into the
 *     building.
 *
 * Pure, so the tests can walk every massing without a DOM.
 */
export function markerSpots(
  type: BuildingType,
  terms: readonly SectionTerm[],
  reference: number | null,
  radius: number,
): MarkerSpot[] {
  const [minX = 0, minY = 0, width = 0, height = 0] = type.viewBox.split(/\s+/).map(Number);
  const bySlot = new Map(terms.map((term) => [term.slot, term]));
  const numbered = markerNumbers(type, terms, reference);
  const gap = radius * 0.25;
  const spots: MarkerSpot[] = [];

  // Every drawn arrow as a segment from its anchor to its tip, with the
  // half-width it is drawn at, so a dot can be kept off shafts as well as off
  // other dots.
  const shafts = [...numbered.keys()].flatMap((slot) => {
    const anchor = type.anchors.find((candidate) => candidate.slot === slot);
    const term = bySlot.get(slot);
    if (!anchor || !term) return [];
    const geometry = arrowGeometry(term.watts, reference);
    const radians = (anchor.rotate * Math.PI) / 180;
    const length = SHAFT_LENGTH * geometry.scale + 6 * geometry.headScale;
    return [{
      slot,
      x1: anchor.x,
      y1: anchor.y,
      x2: anchor.x + Math.cos(radians) * length,
      y2: anchor.y + Math.sin(radians) * length,
      // The head is 11 units either side at scale 1, and wider than the shaft.
      half: 11 * geometry.headScale,
    }];
  });

  for (const slot of numbered.keys()) {
    const anchor = type.anchors.find((candidate) => candidate.slot === slot);
    const term = bySlot.get(slot);
    if (!anchor || !term) continue;
    const geometry = arrowGeometry(term.watts, reference);
    const radians = (anchor.rotate * Math.PI) / 180;
    const along = (distance: number) => ({
      x: anchor.x + Math.cos(radians) * distance,
      y: anchor.y + Math.sin(radians) * distance,
    });
    const clamp = (point: { x: number; y: number }) => ({
      x: Math.min(minX + width - radius, Math.max(minX + radius, point.x)),
      y: Math.min(minY + height - radius, Math.max(minY + radius, point.y)),
    });

    // The head's point is 6 units past its origin, scaled with it.
    let distance = SHAFT_LENGTH * geometry.scale + 6 * geometry.headScale + radius + gap;
    let point = clamp(along(distance));
    for (const shaft of shafts) {
      if (shaft.slot === slot) continue;
      const near = closestOnSegment(point, shaft);
      const clearance = radius + shaft.half + gap;
      const apart = Math.hypot(point.x - near.x, point.y - near.y);
      if (apart >= clearance) continue;
      // Directly on the line gives no direction to move in; take the normal.
      const [ux, uy] =
        apart > 1e-6
          ? [(point.x - near.x) / apart, (point.y - near.y) / apart]
          : normalOf(shaft);
      point = clamp({ x: near.x + ux * clearance, y: near.y + uy * clearance });
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const clash = spots.find((spot) => Math.hypot(spot.x - point.x, spot.y - point.y) < radius * 2 + gap);
      if (!clash) break;
      distance += radius * 2 + gap - Math.hypot(clash.x - point.x, clash.y - point.y);
      point = clamp(along(distance));
    }
    spots.push({ slot, ...point });
  }
  return spots;
}

export const LOSS_SLOTS = new Set<SurfaceSlot>([
  'loss-walls',
  // Not surfaces, and still losses. Left out of this set they drew in the gain
  // colour — a terracotta quantity rendered teal, which is the drawing saying
  // the opposite of what the number says.
  'loss-infiltration',
  'loss-ventilation',
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
  align = 'centre',
  labelMode = 'text',
}: SectionDrawingProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { width: shownWidth } = useWidth(svgRef);
  // Drawing units per CSS pixel. The markers are sized in pixels and drawn in
  // units, so they come out the same size on screen at any width. On a phone
  // the drawing is width-bound, which is what makes this ratio the right one.
  const viewBoxWidth = Number(type.viewBox.split(/\s+/)[2]) || 1028;
  const perPixel = shownWidth > 0 ? viewBoxWidth / shownWidth : 1;
  const numbers = labelMode === 'markers' ? markerNumbers(type, terms, reference) : null;

  // Ids must be unique per instance: the export clone mounts a second copy of
  // this drawing, and a duplicate filter id would have one steal the other's.
  const uid = useId().replace(/:/g, '');
  const sketchId = `hb-sketch-${uid}`;
  const soilId = `hb-soil-${uid}`;
  const gridId = `hb-grid-${uid}`;

  const bySlot = new Map(terms.map((t) => [t.slot, t]));

  return (
    <svg
      ref={svgRef}
      viewBox={type.viewBox}
      data-labels={numbers ? 'markers' : 'text'}
      role="img"
      aria-label={`${type.label} section: envelope heat loss against internal heat gain`}
      preserveAspectRatio={
        align === 'left' ? 'xMinYMid meet' : align === 'right' ? 'xMaxYMid meet' : 'xMidYMid meet'
      }
      /* Without a cap the drawing is sized by the panel's width, which on a
         900 px screen pushes the verdict below the fold. The cap is therefore
         set by the fold budget and nothing else, and it is what makes the
         drawing HEIGHT-bound: at 628 px wide the box could scale the artwork by
         0.61 and the cap allows 0.40, so every unit of viewBox height the crop
         does not need is a unit of size the building gets back.

         That is why the vertical arrows were re-aimed to 45° — the crop went
         from 770 units tall to 632 — and why this number is 250 rather than the
         232 it sat at before — and 232 again now, having gone to 280 and given
         all of it back. The loss table grew two rows on the way: infiltration
         and ventilation, which on a code-built office are the two LARGEST
         entries in it. A drawing of where the heat goes that omitted the two
         biggest places it goes would be worth less than the pixels. The
         building is still drawn 22% larger than before the crop was tightened,
         because the 45° re-aim shortened the crop rather than spending fold. */
      style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 232 }}
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

      {showLabels && numbers && (
        <g fontFamily="IBM Plex Mono, monospace" fontWeight="600" aria-hidden="true">
          {markerSpots(type, terms, reference, (MARKER_PX / 2) * perPixel).map((spot) => (
            <g key={spot.slot} data-marker={spot.slot}>
              <circle
                cx={spot.x}
                cy={spot.y}
                r={(MARKER_PX / 2) * perPixel}
                fill={LOSS_SLOTS.has(spot.slot) ? 'var(--loss)' : 'var(--gain)'}
                stroke="var(--label-halo)"
                strokeWidth={2 * perPixel}
              />
              <text
                x={spot.x}
                y={spot.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={MARKER_FONT_PX * perPixel}
                fill="var(--panel)"
              >
                {numbers.get(spot.slot)}
              </text>
            </g>
          ))}
        </g>
      )}

      {showLabels && !numbers && (
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
