import { describe, expect, it } from 'vitest';

import { crossing, linearScale, niceBounds, niceCeiling, ticksBetween, ticksUpTo } from '../src/chart/scales';
import { resolveTokens } from '../src/io/exportPng';
import { solve } from '../src/engine/balance';
import { SAMPLE_CASE } from '../src/model/sampleProject';

describe('linear scale', () => {
  it('maps the domain onto the range', () => {
    const y = linearScale([0, 20], [300, 0]);
    expect(y(0)).toBe(300);
    expect(y(20)).toBe(0);
    expect(y(10)).toBe(150);
  });

  it('does not divide by zero on a flat domain', () => {
    const y = linearScale([5, 5], [0, 100]);
    expect(Number.isFinite(y(5))).toBe(true);
  });
});

describe('axis ceiling', () => {
  it('rounds up to a number a person would say out loud', () => {
    expect(niceCeiling(18.4).max).toBe(20);
    expect(niceCeiling(4.65).max).toBe(5);
    expect(niceCeiling(0.44).max).toBe(0.5);
    expect(niceCeiling(9.66).max).toBe(10);
  });

  it('does not leave a third of the chart empty just past a step boundary', () => {
    // With four target ticks, data reaching 19.4 got an axis to 30 — which
    // reads as a fault in the data rather than a choice about the axis.
    const { max } = niceCeiling(20.4);
    expect(max).toBe(25);
    expect(max / 20.4).toBeLessThan(1.3);
  });

  it('never carries floating-point drift into the axis label', () => {
    for (const value of [0.44, 4.65, 9.66, 20.4, 44.1, 402]) {
      const { max } = niceCeiling(value);
      expect(String(max)).not.toMatch(/\d{6,}/);
    }
  });

  it('always reaches past the data', () => {
    for (const value of [0.3, 1, 4.65, 17.9, 42, 383]) {
      expect(niceCeiling(value).max).toBeGreaterThanOrEqual(value);
    }
  });

  it('survives a degenerate maximum rather than producing NaN ticks', () => {
    expect(niceCeiling(0).max).toBe(1);
    expect(niceCeiling(Number.NaN).max).toBe(1);
    expect(niceCeiling(-5).max).toBe(1);
  });

  it('names only values the chart actually reaches', () => {
    const { max, step } = niceCeiling(18.4);
    const ticks = ticksUpTo(max, step);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(max);
    for (const t of ticks) expect(t).toBeLessThanOrEqual(max);
  });

  it('does not emit a duplicate final tick from floating-point drift', () => {
    // Adding 0.1 ten times lands on 0.9999999999999999 and produces two ticks
    // that both render as "1".
    const ticks = ticksUpTo(1, 0.1);
    expect(new Set(ticks.map((t) => t.toFixed(6))).size).toBe(ticks.length);
    expect(ticks.at(-1)).toBeCloseTo(1, 10);
  });
});

describe('curve crossing', () => {
  it('finds where loss drops through gain', () => {
    const point = crossing(0, 10, 0, 10, 0, 10);
    expect(point?.x).toBeCloseTo(5, 6);
    expect(point?.y).toBeCloseTo(5, 6);
  });

  it('returns nothing when the curves do not cross', () => {
    expect(crossing(0, 10, 1, 10, 12, 2)).toBeNull();
    expect(crossing(0, 1, 10, 10, 2, 12)).toBeNull();
  });

  it('returns nothing when the gap is identical at both ends', () => {
    expect(crossing(0, 5, 3, 10, 5, 3)).toBeNull();
  });
});

describe('the chart has something to draw for the worked example', () => {
  const result = solve(SAMPLE_CASE);

  it('has two deficit runs — overnight and evening', () => {
    // Hours 0–8 and 18–23. A single run would mean the building never recovers,
    // and three would mean the curves cross more than the schedule allows.
    const shortfall = result.hours.map((h) => h.net < 0);
    let runs = 0;
    for (let i = 0; i < 24; i++) if (shortfall[i] && !shortfall[i - 1]) runs++;
    expect(runs).toBe(2);
  });

  it('leaves the tallest curve inside the axis', () => {
    // The ceiling used to have to clear a fixed benchmark line as well; with
    // that gone, the only thing it must contain is the data.
    const maxLoss = Math.max(...result.hours.map((h) => h.loss / 500));
    expect(niceCeiling(maxLoss * 1.05).max).toBeGreaterThan(maxLoss);
  });
});

describe('export token resolution', () => {
  /**
   * The failure this prevents produces a perfectly valid PNG in the wrong
   * colours — or in opaque black, which is what `fill` falls back to when a
   * `var()` resolves to nothing in a serialised SVG with no stylesheet.
   */
  it('replaces every token with its literal light value', () => {
    expect(resolveTokens('var(--loss)')).toBe('#A8462E');
    expect(resolveTokens('var(--gain)')).toBe('#2F7D6E');
    expect(resolveTokens('var(--ink)')).toBe('#0C2A24');
  });

  it('resolves the LIGHT palette regardless of the viewer’s theme', () => {
    // An exported figure must not carry whichever mode its author happened to
    // be in. #0C2A24 is the light ink; the dark one is #D8DEE3.
    expect(resolveTokens('var(--ink)')).not.toBe('#D8DEE3');
  });

  it('handles several tokens in one attribute and tolerates whitespace', () => {
    expect(resolveTokens('var(--loss) var( --gain )')).toBe('#A8462E #2F7D6E');
  });

  it('leaves an unknown token alone rather than emitting an empty string', () => {
    // An empty fill is invisible; an unresolved var at least renders as the
    // fallback and is findable.
    expect(resolveTokens('var(--not-a-token)')).toBe('var(--not-a-token)');
  });

  it('leaves literal colours untouched', () => {
    expect(resolveTokens('#A8462E')).toBe('#A8462E');
    expect(resolveTokens('none')).toBe('none');
  });

  it('covers every token the drawings actually use', () => {
    const used = [
      '--page', '--panel', '--border', '--ink', '--muted', '--loss', '--gain',
      '--massing-fill', '--massing-fill-opacity', '--soil', '--ground-line',
      '--label-halo', '--grid',
    ];
    for (const token of used) {
      expect(resolveTokens(`var(${token})`)).not.toContain('var(');
    }
  });
});

/**
 * The second axis.
 *
 * Outdoor dry-bulb is plotted beside two heat fluxes, and it is the one series
 * on the chart that goes below zero. `niceCeiling` cannot hold it: it assumes
 * the axis starts at zero, which would clip exactly the coldest hours the tool
 * exists to reason about.
 */
describe('niceBounds handles an axis that goes negative', () => {
  it('reaches below zero rather than clipping to it', () => {
    const { min, max } = niceBounds(-15.3, 2.1);
    expect(min).toBeLessThanOrEqual(-15.3);
    expect(max).toBeGreaterThanOrEqual(2.1);
  });

  it('snaps both ends to a multiple of the step', () => {
    const { min, max, step } = niceBounds(-15.3, 2.1);
    expect(Math.abs(min / step - Math.round(min / step))).toBeLessThan(1e-9);
    expect(Math.abs(max / step - Math.round(max / step))).toBeLessThan(1e-9);
  });

  it('contains an all-positive range too — Fahrenheit rarely goes below zero', () => {
    const { min, max } = niceBounds(4.5, 38.2);
    expect(min).toBeLessThanOrEqual(4.5);
    expect(max).toBeGreaterThanOrEqual(38.2);
  });

  it('opens out a flat profile instead of dividing by a zero span', () => {
    const { min, max } = niceBounds(10, 10);
    expect(max).toBeGreaterThan(min);
    expect(Number.isFinite(min) && Number.isFinite(max)).toBe(true);
  });

  it('ticksBetween names both ends and nothing beyond them', () => {
    const { min, max, step } = niceBounds(-15.3, 2.1);
    const ticks = ticksBetween(min, max, step);
    expect(ticks[0]).toBeCloseTo(min, 9);
    expect(ticks.at(-1)).toBeCloseTo(max, 9);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(min - 1e-9);
      expect(t).toBeLessThanOrEqual(max + 1e-9);
    }
  });

  it('produces no duplicate tick, the trap ticksUpTo documents', () => {
    const ticks = ticksBetween(-0.6, 0.6, 0.1);
    expect(new Set(ticks.map((t) => t.toFixed(6))).size).toBe(ticks.length);
  });

  /**
   * The reason the interval count is exact rather than a target.
   *
   * The temperature axis shares a plot with the flux axis and is given that
   * axis's own interval count, so both divide the same pixel height into the
   * same bands and every label on the right lands on a gridline drawn for the
   * left. A target count agrees on some days and not others — which is the
   * worst version, because it looks deliberate right up until it does not.
   */
  it('returns exactly the intervals asked for, whatever the data', () => {
    const cases: Array<[number, number]> = [
      [-15.3, 2.1],   // Boston in Celsius
      [4.5, 28.9],    // the same day in Fahrenheit
      [-40, -12],     // entirely below zero
      [0.02, 0.31],   // a sub-unit span
      [-3, 1200],     // three orders of magnitude
      [10, 10],       // flat
    ];
    for (const intervals of [2, 3, 4, 5, 6]) {
      for (const [low, high] of cases) {
        const { min, max, step } = niceBounds(low, high, intervals);
        expect(ticksBetween(min, max, step), `${low}..${high} / ${intervals}`)
          .toHaveLength(intervals + 1);
        expect(min).toBeLessThanOrEqual(low);
        expect(max).toBeGreaterThanOrEqual(high);
      }
    }
  });

  it('never names a tick the axis does not reach', () => {
    // The step widens to cover the data rather than the ceiling being stretched
    // to fit, so the last tick IS the maximum rather than sitting past it.
    const { min, max, step } = niceBounds(-15.3, 2.1, 4);
    expect(ticksBetween(min, max, step).at(-1)).toBeCloseTo(max, 9);
  });
});
