/**
 * How a watt becomes an arrow.
 *
 * The canvas encodes magnitude twice — shaft LENGTH and stroke WEIGHT — against
 * a shared reference, so an arrow means the same thing wherever it sits on the
 * drawing. That is a better encoding than the share-of-UA weighting originally
 * specced: a fraction of the envelope can never put gains on the same scale as
 * losses, and comparing the windows arrow to the people arrow is the comparison
 * the whole tool exists to make.
 *
 * Two changes from the canvas, both of which only show up on real numbers.
 *
 * **The reference is derived per project, not fixed at 800 W.** The canvas's
 * sliders top out at 2,400 W and `k` clamps at 2.3, i.e. about 1,840 W. The
 * worked example's windows term is 4,129 W and its roof 2,687 W — both would
 * clamp, and a 1.5× difference would render as two identical arrows. So the
 * reference is set from the largest term the project produces, which puts that
 * arrow exactly at the ceiling and leaves everything else proportional below it.
 *
 * **The reference is computed once over all 24 hours, never per hour.** Per-hour
 * normalisation would rescale the drawing as you scrub, hiding the very thing
 * scrubbing is for: the gain arrows collapsing overnight while the loss arrows
 * grow.
 */

export const SHAFT_LENGTH = 88;

/** Matches the canvas: 0.3 is a stub, 2.3 is the longest arrow drawn. */
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 2.3;
export const MIN_WIDTH = 2.2;
export const MAX_WIDTH = 6.2;
/**
 * How big the head may get relative to its size at MIN_WIDTH.
 *
 * Strict proportionality would put it at 6.2 / 2.2 = 2.82, which on the longest
 * arrow is a head a third of the shaft. 2.4 keeps the ratio honest and the
 * arrow still reading as an arrow.
 */
export const MAX_HEAD_SCALE = 2.4;

export interface ArrowGeometry {
  /** `scale(k, 1)` on the shaft. */
  readonly scale: number;
  /** `translate(dx, 0)` on the head, so the arrowhead stays undistorted. */
  readonly tipOffset: number;
  readonly strokeWidth: number;
  /**
   * Uniform scale on the arrowhead.
   *
   * The head used to be a fixed 22-unit shape while the shaft's weight ran from
   * 2.2 to 6.2 — so the heaviest arrow, which is the one carrying the biggest
   * number, wore the same small head as the lightest and read as a blunt bar.
   * The head now grows with the stroke so the two stay in proportion.
   */
  readonly headScale: number;
  /** False when the term is zero and nothing should be drawn at all. */
  readonly visible: boolean;
}

/**
 * The reference watt value for a project: the largest single term anywhere in
 * the 24 hours, scaled so it lands exactly at `MAX_SCALE`.
 *
 * Returns null when every term is zero — an empty project, where there is
 * nothing to draw and no sensible reference to pick.
 */
export function referenceWatts(allTermWatts: readonly number[]): number | null {
  let largest = 0;
  for (const w of allTermWatts) {
    const magnitude = Math.abs(w);
    if (magnitude > largest) largest = magnitude;
  }
  return largest > 0 ? largest / MAX_SCALE : null;
}

/**
 * Geometry for one arrow.
 *
 * **A zero term draws nothing.** The canvas floors `k` at 0.3, so a 0 W term
 * still renders a stub — and people at 06:00 is exactly 0 W. An unoccupied hour
 * that shows a people arrow is the drawing asserting a gain that is not there,
 * which is worse than an empty space.
 */
export function arrowGeometry(watts: number, reference: number | null): ArrowGeometry {
  const magnitude = Math.abs(watts);

  if (magnitude <= 0 || reference === null || reference <= 0) {
    return { scale: 0, tipOffset: 0, strokeWidth: MIN_WIDTH, headScale: 1, visible: false };
  }

  const raw = magnitude / reference;
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));

  // Weight rises with the same ratio but over a narrower band, so a long arrow
  // is also a heavy one without the drawing turning into slabs.
  const width = Math.min(
    MAX_WIDTH,
    Math.max(MIN_WIDTH, MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * (raw / MAX_SCALE)),
  );

  return {
    scale,
    tipOffset: SHAFT_LENGTH * (scale - 1),
    strokeWidth: width,
    headScale: Math.min(MAX_HEAD_SCALE, width / MIN_WIDTH),
    visible: true,
  };
}
