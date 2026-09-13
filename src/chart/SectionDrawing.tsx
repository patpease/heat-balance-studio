import { useId } from 'react';

import { GROUND_LINES, PERSON_HEADS } from '../model/buildingTypes';
import type { BuildingType, SurfaceSlot } from '../model/types';
import { arrowGeometry, MAX_SCALE, SHAFT_LENGTH } from './arrowScale';

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
 * Where a label sits, and why it does not follow its arrow.
 *
 * It used to be parked past the arrowhead at `SHAFT_LENGTH * scale + 18`, so it
 * swung 44 to 220 units outward as the value changed. Two things went wrong at
 * the far end: the label ran past the massing's crop and was cut off, and on a
 * building whose loss is lopsided the long arrow's label collided with its
 * neighbours. Either way the text became unreadable exactly when the arrow was
 * most worth reading.
 *
 * Now nothing moves. A LOSS label sits at a fixed radius just beyond the
 * longest arrow the scale can produce, so an arrow grows toward its label and
 * never reaches it. A GAIN label sits beside its glyph — left of the person,
 * right of the lamp — because a gain arrow points up into the space and there
 * is no room above it for a label at any radius.
 */
const LOSS_LABEL_RADIUS = SHAFT_LENGTH * MAX_SCALE + 22;

/** Offsets in drawing units from the anchor, and which way the text runs. */
const GAIN_LABEL: Record<string, { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }> = {
  'gain-people': { dx: -30, dy: 6, anchor: 'end' },
  'gain-lighting': { dx: 28, dy: 5, anchor: 'start' },
  // Misc above its box and IT below its rack: the two glyphs sit side by side
  // and their labels are long, so they are separated vertically or not at all.
  'gain-misc-equipment': { dx: 0, dy: -26, anchor: 'middle' },
  'gain-it-equipment': { dx: 0, dy: 42, anchor: 'middle' },
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
      /* Without a cap the drawing is sized by the panel's width — 626 px wide
         made it 297 px tall, which on a 900 px screen pushed the verdict below
         the fold. 184 leaves the fold about 27 px of slack for a long location
         name or a wrapped verdict sentence. It scales down inside the box and stays centred. */
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
                <path d={HEAD} stroke="none" />
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

            const gain = GAIN_LABEL[anchor.slot];
            const radians = (anchor.rotate * Math.PI) / 180;
            // Fixed either way — nothing here reads the arrow's length.
            const x = gain ? anchor.x + gain.dx : anchor.x + LOSS_LABEL_RADIUS * Math.cos(radians);
            const y = gain ? anchor.y + gain.dy : anchor.y + LOSS_LABEL_RADIUS * Math.sin(radians);
            const anchorPoint = gain
              ? gain.anchor
              : Math.cos(radians) < -0.3 ? 'end' : Math.cos(radians) > 0.3 ? 'start' : 'middle';
            return (
              <text
                key={anchor.slot}
                x={x}
                y={y}
                textAnchor={anchorPoint}
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
