/**
 * Chart scales.
 *
 * Hand-rolled rather than pulled from a charting library: the chart is one
 * linear axis against 24 hours, and a library would cost more in bundle than it
 * saves in code — and would style itself, which the token system would then
 * have to fight.
 */

export interface LinearScale {
  (value: number): number;
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
}

export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const fn = ((value: number) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0))) as {
    (value: number): number;
    domain?: readonly [number, number];
    range?: readonly [number, number];
  };
  fn.domain = domain;
  fn.range = range;
  return fn as LinearScale;
}

/**
 * A round upper bound and a matching tick step.
 *
 * The axis must reach a number a person would say out loud, and every tick must
 * name a value the chart actually reaches — an axis topping out at 17.3 with a
 * tick at 20 is an axis lying about its own extent.
 */
export function niceCeiling(max: number, targetTicks = 5): { max: number; step: number } {
  if (!Number.isFinite(max) || max <= 0) return { max: 1, step: 0.5 };

  const rough = max / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;

  // 1, 2, 2.5, 5, 10 — the steps that read as deliberate.
  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10) *
    magnitude;

  // Five target ticks rather than four, because a coarse step plus a ceiling
  // overshoots badly just past a boundary: at four, data reaching 19.4 gets an
  // axis to 30 — a third of the chart empty, which reads as a bug in the data
  // rather than a choice about the axis.
  //
  // Rounded because `Math.ceil(0.441 / 0.1) * 0.1` lands on 0.6000000000000001,
  // which reaches the axis label and the domain.
  const rounded = Math.ceil(max / step - 1e-9) * step;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 2);
  return { max: Number(rounded.toFixed(decimals)), step };
}

export function ticksUpTo(max: number, step: number): number[] {
  const out: number[] = [];
  // Accumulate by multiplication rather than repeated addition: adding 0.1 ten
  // times lands on 0.9999999999999999 and produces a duplicate final tick.
  for (let i = 0; i * step <= max + step * 1e-9; i++) out.push(i * step);
  return out;
}

/** Where a loss curve crosses a gain curve between two hours. */
export function crossing(
  x0: number,
  y0Loss: number,
  y0Gain: number,
  x1: number,
  y1Loss: number,
  y1Gain: number,
): { x: number; y: number } | null {
  const d0 = y0Loss - y0Gain;
  const d1 = y1Loss - y1Gain;
  if (d0 === d1 || d0 * d1 > 0) return null;
  const t = d0 / (d0 - d1);
  return { x: x0 + (x1 - x0) * t, y: y0Loss + (y1Loss - y0Loss) * t };
}
