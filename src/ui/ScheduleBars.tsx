import { useRef, useState } from 'react';

/**
 * A 24-hour schedule, as bars you drag.
 *
 * Height is the hour's fraction of full load. Dragging across the strip paints
 * every hour it passes, which is how anyone actually edits a profile — nobody
 * wants to set 24 numbers one at a time.
 *
 * The strip sits beside its density so the product of the two reads as one
 * statement, and the playhead marks the hour the verdict is decided on, so the
 * overnight floor is visible as the thing it is rather than as a detail.
 *
 * Keyboard: the strip is focusable and arrow keys move and adjust, because a
 * drag-only control is unusable for anyone not using a mouse.
 */

const HOURS = 24;

export interface ScheduleBarsProps {
  readonly fractions: readonly number[];
  readonly onChange: (hour: number, fraction: number) => void;
  /** Drawn as a vertical rule — the worst hour. */
  readonly marker?: number | null;
  readonly label: string;
  /**
   * A strip that reports rather than accepts.
   *
   * The ventilation fan has no 24 free numbers — it either runs constantly or
   * follows the people, and both are already said by the buttons beside it.
   * Drawing it anyway keeps that row the same shape as the four above it, and a
   * read-only strip is the only honest way to do that.
   */
  readonly readOnly?: boolean;
  /** Ventilation is a loss, and must not be drawn in the gain colour. */
  readonly tone?: 'gain' | 'loss';
}

export function ScheduleBars({
  fractions,
  onChange,
  marker = null,
  label,
  readOnly = false,
  tone = 'gain',
}: ScheduleBarsProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [painting, setPainting] = useState(false);
  const [focusHour, setFocusHour] = useState(0);

  const width = 240;
  const height = 34;
  const barWidth = width / HOURS;

  /** Pointer position → which hour, and what fraction. */
  const readPointer = (event: { clientX: number; clientY: number }) => {
    const svg = ref.current;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    const hour = Math.min(HOURS - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * HOURS)));
    const raw = 1 - (event.clientY - box.top) / box.height;
    return { hour, fraction: Math.min(1, Math.max(0, Math.round(raw * 20) / 20)) };
  };

  const paint = (event: { clientX: number; clientY: number }) => {
    if (readOnly) return;
    const hit = readPointer(event);
    if (hit) onChange(hit.hour, hit.fraction);
  };

  const fill = tone === 'loss' ? 'var(--loss)' : 'var(--gain)';

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="group"
      aria-label={`${label} schedule, 24 hours`}
      tabIndex={readOnly ? -1 : 0}
      style={{
        display: 'block',
        touchAction: 'none',
        cursor: readOnly ? 'default' : 'crosshair',
        borderRadius: 2,
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setPainting(true);
        paint(event);
      }}
      onPointerMove={(event) => painting && paint(event)}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        setPainting(false);
      }}
      onPointerCancel={() => setPainting(false)}
      onKeyDown={(event) => {
        if (readOnly) return;
        const current = fractions[focusHour] ?? 0;
        if (event.key === 'ArrowLeft') setFocusHour((h) => Math.max(0, h - 1));
        else if (event.key === 'ArrowRight') setFocusHour((h) => Math.min(HOURS - 1, h + 1));
        else if (event.key === 'ArrowUp') onChange(focusHour, Math.min(1, current + 0.05));
        else if (event.key === 'ArrowDown') onChange(focusHour, Math.max(0, current - 0.05));
        else return;
        event.preventDefault();
      }}
    >
      <rect x="0" y="0" width={width} height={height} fill="var(--page)" />

      {Array.from({ length: HOURS }, (_, hour) => {
        const fraction = Math.min(1, Math.max(0, fractions[hour] ?? 0));
        const barHeight = fraction * height;
        return (
          <g key={hour}>
            <rect
              x={hour * barWidth}
              y={height - barHeight}
              width={barWidth - 0.7}
              height={barHeight}
              fill={fill}
              opacity={readOnly ? 0.6 : hour === focusHour ? 1 : 0.85}
            />
            {/* A hairline at zero, so an empty hour is visibly an hour rather
                than a gap in the strip. */}
            {fraction === 0 && (
              <rect x={hour * barWidth} y={height - 1} width={barWidth - 0.7} height={1} fill="var(--border)" />
            )}
          </g>
        );
      })}

      {/* Six-hour gridlines, drawn over the bars so the shape stays readable. */}
      {[6, 12, 18].map((hour) => (
        <line
          key={hour}
          x1={hour * barWidth}
          y1="0"
          x2={hour * barWidth}
          y2={height}
          stroke="var(--panel)"
          strokeWidth="1"
          opacity="0.7"
        />
      ))}

      {marker !== null && (
        <line
          x1={marker * barWidth + barWidth / 2}
          y1="0"
          x2={marker * barWidth + barWidth / 2}
          y2={height}
          stroke="var(--loss)"
          strokeWidth="1.4"
        />
      )}
    </svg>
  );
}
