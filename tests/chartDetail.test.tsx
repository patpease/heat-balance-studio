// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BalanceChart } from '../src/chart/BalanceChart';
import { SERIES_COLOUR, seriesFrom } from '../src/chart/series';
import { signedBounds, ticksAcross } from '../src/chart/scales';
import { resolveTokens, serialiseSvg } from '../src/io/exportPng';
import { SCOPE_STATEMENT, WEATHER_ATTRIBUTION } from '../src/config/branding';
import { solve } from '../src/engine/balance';
import { DEFAULT_CONDITIONS, DEFAULT_ENVELOPE, DEFAULT_GAINS } from '../src/model/defaults';
import { SAMPLE_DESIGN_DAY } from '../src/model/sampleProject';
import { DEFAULT_VENTILATION } from '../src/model/ventilation';
import type { SurfaceSlot } from '../src/model/types';

afterEach(cleanup);

// The App reads the OS theme preference on mount; jsdom has no matchMedia.
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

const result = solve({
  envelope: DEFAULT_ENVELOPE,
  gains: DEFAULT_GAINS,
  conditions: DEFAULT_CONDITIONS,
  designDay: SAMPLE_DESIGN_DAY,
  ventilation: DEFAULT_VENTILATION,
});

const chart = (detailed: boolean) =>
  render(
    <BalanceChart
      result={result}
      floorArea={DEFAULT_ENVELOPE.floorArea}
      units="IP"
      hoveredHour={null}
      onHoverHour={vi.fn()}
      detailed={detailed}
    />,
  ).container;

const ALL_SLOTS: readonly SurfaceSlot[] = [
  'loss-walls', 'loss-windows', 'loss-roof', 'loss-ground-floor', 'loss-exposed-floor',
  'loss-infiltration', 'loss-ventilation',
  'gain-people', 'gain-lighting', 'gain-misc-equipment', 'gain-it-equipment',
];

describe('pulling the components out', () => {
  it('drops a component that is zero all day', () => {
    // The default building has no exposed floor and no IT load. A flat line on
    // the axis is a legend entry and a colour spent on nothing.
    const slots = seriesFrom(result.hours, (w) => w).map((s) => s.slot);
    expect(slots).not.toContain('loss-exposed-floor');
    expect(slots).not.toContain('gain-it-equipment');
    expect(slots).toContain('loss-ventilation');
  });

  it('orders by peak, largest first, so the legend reads as a ranking', () => {
    const peaks = seriesFrom(result.hours, (w) => w).map((s) => s.peak);
    expect(peaks).toEqual([...peaks].sort((a, b) => b - a));
  });

  it('gives every slot a colour, including the ones this building lacks', () => {
    for (const slot of ALL_SLOTS) {
      expect(SERIES_COLOUR[slot], slot).toMatch(/^var\(--s-[a-z-]+\)$/);
    }
    expect(new Set(Object.values(SERIES_COLOUR)).size).toBe(ALL_SLOTS.length);
  });
});

describe('the series palette is defined everywhere it has to be', () => {
  const tokens = readFileSync(resolve(import.meta.dirname, '../src/ui/tokens.css'), 'utf8');

  it('defines each series colour in the light block and both dark blocks', () => {
    for (const value of Object.values(SERIES_COLOUR)) {
      const name = value.slice(4, -1);
      const hits = tokens.match(new RegExp(`${name}:\\s*#[0-9A-Fa-f]{6};`, 'g')) ?? [];
      expect(hits, name).toHaveLength(3);
    }
  });

  /**
   * The one that would have shipped silently.
   *
   * The PNG export resolves `var()` against a map maintained BY HAND. A token
   * missing from it survives into the exported SVG as a literal
   * `var(--s-roof)`, which paints nothing — so the chart is right on screen and
   * the file someone sends on is missing a line. Nothing else checks this.
   */
  it('resolves every series colour for the PNG export', () => {
    for (const value of Object.values(SERIES_COLOUR)) {
      expect(resolveTokens(value), value).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('the sign convention', () => {
  const series = seriesFrom(result.hours, (w) => w);

  it('puts losses below zero and gains above', () => {
    for (const one of series) {
      const sign = one.kind === 'loss' ? -1 : 1;
      for (const value of one.values) {
        expect(Math.sign(value) === sign || value === 0, `${one.slot} ${value}`).toBe(true);
      }
    }
  });

  /**
   * The invariant the whole view rests on: the parts add up to the whole it is
   * drawn beside. A scaling slip or a dropped sign would leave a chart that
   * still looked plausible — nine lines and two totals, all moving the right
   * way — and quietly did not reconcile.
   */
  it('has the components summing to the totals, hour by hour, in both directions', () => {
    result.hours.forEach((hour, h) => {
      const of = (kind: 'loss' | 'gain') =>
        series.filter((s) => s.kind === kind).reduce((sum, s) => sum + (s.values[h] ?? 0), 0);
      expect(of('loss'), `hour ${h} loss`).toBeCloseTo(-hour.loss, 6);
      expect(of('gain'), `hour ${h} gain`).toBeCloseTo(hour.gain, 6);
    });
  });

  it('orders by magnitude, so one ranking rather than two', () => {
    const peaks = series.map((s) => s.peak);
    expect(peaks).toEqual([...peaks].sort((a, b) => b - a));
    expect(peaks.every((p) => p > 0)).toBe(true);
  });
});

describe('the signed axis', () => {
  it('lands zero exactly on a gridline', () => {
    for (const [low, high] of [[-14.3, 6.2], [-1, 0.04], [-320, 90], [-7.5, 7.5]] as const) {
      const { min, max, step } = signedBounds(low, high);
      expect(ticksAcross(min, max, step)).toContain(0);
      expect(min).toBeLessThanOrEqual(low);
      expect(max).toBeGreaterThanOrEqual(high);
    }
  });

  /**
   * Fitted, not forced symmetric. A building losing ten times what it makes is
   * the normal case, and a symmetric axis would both waste half the chart and
   * imply the two sides are comparable magnitudes.
   */
  it('does not spend half the chart on an empty upper half', () => {
    const { min, max } = signedBounds(-14.3, 6.2);
    expect(max).toBeLessThan(-min);
  });

  it('still gives a zero-crossing axis to a series that never changes sign', () => {
    const { min, max, step } = signedBounds(-9, 0);
    expect(max).toBe(0);
    expect(ticksAcross(min, max, step)).toContain(0);
  });
});

describe('the detailed chart', () => {
  it('is off unless asked for', () => {
    const plain = chart(false);
    // Loss, gain and the outdoor reference; the deficit hatch as a polygon.
    expect(plain.querySelectorAll('polyline')).toHaveLength(3);
    expect(plain.querySelectorAll('polygon').length).toBeGreaterThan(0);
  });

  it('draws a line per component and keeps both totals', () => {
    const detail = chart(true);
    const strokes = [...detail.querySelectorAll('polyline')].map((p) => p.getAttribute('stroke'));
    expect(strokes).toContain('var(--loss)');
    expect(strokes).toContain('var(--gain)');
    for (const slot of ['loss-walls', 'loss-ventilation', 'gain-people'] as SurfaceSlot[]) {
      expect(strokes, slot).toContain(SERIES_COLOUR[slot]);
    }
  });

  /**
   * It subtracts as much as it adds. Nine lines plus a hatch plus a dashed
   * reference on a second scale is not a denser chart, it is an unreadable one.
   */
  it('drops the hatch, the outdoor line and the second axis', () => {
    const detail = chart(true);
    expect(detail.querySelectorAll('polygon')).toHaveLength(0);
    const strokes = [...detail.querySelectorAll('polyline')].map((p) => p.getAttribute('stroke'));
    expect(strokes).not.toContain('var(--muted)');
    expect(detail.querySelector('svg')!.textContent).not.toContain('right');
  });

  it('draws the zero rule only where there is a zero to cross', () => {
    const inkRule = (container: HTMLElement) =>
      [...container.querySelectorAll('line')].filter((l) => l.getAttribute('stroke') === 'var(--ink)');
    expect(inkRule(chart(true))).toHaveLength(1);
    expect(inkRule(chart(false))).toHaveLength(0);
  });

  it('reads out every series at the hour, signed, and both totals', () => {
    const detail = chart(true);
    const grid = detail.querySelector('div[style*="repeat(auto-fit"]')!;
    const rows = [...grid.children].map((c) => c.textContent ?? '');
    expect(rows[0]).toMatch(/^envelope loss−\d/);
    expect(rows[1]).toMatch(/^internal gain\+\d/);
    expect(rows.filter((r) => r.includes('−')).length).toBeGreaterThan(1);
    expect(rows.filter((r) => r.includes('+')).length).toBeGreaterThan(1);
  });

  /**
   * A key was drawn inside the svg for one revision, so an exported PNG could
   * be read on its own. It cost 130 px of reserved right margin on every live
   * viewing of the chart to serve an export that happens rarely, and it was
   * withdrawn. This pins the decision rather than leaving its absence to
   * chance — and records where the answer belongs if it comes back: in the
   * export clone, which costs the page nothing.
   */
  it('spends no plot width on a key, and gives the axis margin back', () => {
    const svg = chart(true).querySelector('svg')!;
    expect(svg.querySelectorAll('g[aria-hidden="true"]')).toHaveLength(0);

    // The rightmost gridline reaches further across than in the simple view,
    // where the temperature axis holds that margin.
    const reach = (container: HTMLElement) =>
      Math.max(
        ...[...container.querySelectorAll('line')].map((l) => Number(l.getAttribute('x2') ?? 0)),
      );
    expect(reach(chart(true))).toBeGreaterThan(reach(chart(false)));
  });

  it('names the delta and the air temperature rather than leaving them bare', () => {
    const caption = chart(true).querySelector('figcaption')!.textContent ?? '';
    expect(caption).toMatch(/Btu\/h·ft² delta/);
    expect(caption).toMatch(/°F air temperature/);
    expect(caption).not.toMatch(/°F out/);
  });

  it('keeps that readout out of the simple view', () => {
    expect(chart(false).querySelector('div[style*="repeat(auto-fit"]')).toBeNull();
  });

  it('says in its label that it is a breakdown, and of how many', () => {
    const detail = chart(true);
    expect(detail.querySelector('svg')!.getAttribute('aria-label')).toMatch(/broken down into 9 components/);
  });
});

describe('what an exported figure says about itself', () => {
  const exported = () => {
    const svg = chart(true).querySelector('svg') as unknown as SVGSVGElement;
    return serialiseSvg(svg, { filename: 'x.png', caption: 'Boston, Massachusetts · Large Office' });
  };

  it('names the building and where it is, and nothing else in that line', () => {
    expect(exported()).toContain('Boston, Massachusetts · Large Office');
  });

  /**
   * Three lines of small type across the foot of every image said what the
   * page already says. What someone needs off a shared chart is which
   * building, where.
   */
  it('no longer burns the scope and exclusions statements into every image', () => {
    expect(exported()).not.toContain(SCOPE_STATEMENT.slice(0, 40));
  });

  /**
   * The one line here that is not ours to trim: ERA5 via Open-Meteo is
   * CC BY 4.0, and the credit is a condition of handing the data to someone
   * else — which is exactly what an export does.
   */
  it('keeps the weather attribution, which is a licence condition', () => {
    expect(exported()).toContain(WEATHER_ATTRIBUTION);
  });
});

describe('the Details button', () => {
  it('starts off and toggles', async () => {
    const { App } = await import('../src/ui/App');
    const { container } = render(<App />);
    const button = screen.getByRole('button', { name: 'Details' });

    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('svg[aria-label*="broken down"]')).toBeNull();

    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('svg[aria-label*="broken down"]')).not.toBeNull();

    fireEvent.click(button);
    expect(container.querySelector('svg[aria-label*="broken down"]')).toBeNull();
  });
});
