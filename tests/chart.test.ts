import { describe, expect, it } from 'vitest';

import { crossing, linearScale, niceCeiling, ticksUpTo } from '../src/chart/scales';
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

  it('peaks above the Passive House line, so the benchmark is visible on the axis', () => {
    const maxLoss = Math.max(...result.hours.map((h) => h.loss / 500));
    expect(maxLoss).toBeGreaterThan(10);
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
