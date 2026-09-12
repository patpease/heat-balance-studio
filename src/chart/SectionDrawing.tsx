import { useId } from 'react';

import { OFFICE_GROUND_LINE, OFFICE_PERSON_HEAD } from '../model/buildingTypes';
import type { BuildingType, SurfaceSlot } from '../model/types';
import { arrowGeometry, SHAFT_LENGTH } from './arrowScale';

/**
 * The section drawing.
 *
 * Renders whichever `BuildingType` record it is handed — that indirection is
 * the whole point, because v2's five extra massings then need no change here.
 *
 * Every colour is a token, so the light and dark canvases are one drawing. The
 * sketch filter is applied to the SHELL ONLY and not to the arrows: the canvas
 * filters the whole artwork, which would re-run a displacement map over the
 * entire drawing on every frame of a slider drag.
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

/** The 88-unit shaft, drawn twice with opposite curvature so arrows alternate. */
const SHAFT_A = 'M0 0 C 22 -5 44 4 64 -2 L 88 0';
const SHAFT_B = 'M0 0 C 22 4 44 -5 64 2 L 88 0';
const HEAD = 'M6 0 L -16 -11 L -10 0 L -16 11 Z';

export function SectionDrawing({
  type,
  terms,
  reference,
  sketch = true,
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
      style={{ display: 'block', width: '100%', height: 'auto' }}
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
        <path d={OFFICE_GROUND_LINE} fill="none" stroke="var(--ground-line)" strokeWidth="2.2" />

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
          <circle cx={OFFICE_PERSON_HEAD.cx} cy={OFFICE_PERSON_HEAD.cy} r={OFFICE_PERSON_HEAD.r} />
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
            const geometry = arrowGeometry(term.watts, reference);
            // Park the label past the arrowhead, in the arrow's own direction.
            const distance = SHAFT_LENGTH * geometry.scale + 18;
            const radians = (anchor.rotate * Math.PI) / 180;
            const x = anchor.x + distance * Math.cos(radians);
            const y = anchor.y + distance * Math.sin(radians);
            const anchorPoint = Math.cos(radians) < -0.3 ? 'end' : Math.cos(radians) > 0.3 ? 'start' : 'middle';
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
