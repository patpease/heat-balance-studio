// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BalanceChart } from '../src/chart/BalanceChart';
import { markerNumbers, markerSpots } from '../src/chart/SectionDrawing';
import type { SectionTerm } from '../src/chart/SectionDrawing';
import { referenceWatts } from '../src/chart/arrowScale';
import { COMPACT_BELOW } from '../src/chart/useWidth';
import { solve } from '../src/engine/balance';
import { BUILDING_TYPES, OFFICE } from '../src/model/buildingTypes';
import { DEFAULT_ENVELOPE } from '../src/model/defaults';
import { SAMPLE_CONDITIONS, SAMPLE_DESIGN_DAY, SAMPLE_GAINS } from '../src/model/sampleProject';
import { DEFAULT_VENTILATION } from '../src/model/ventilation';
import { EnvelopePanel } from '../src/ui/EnvelopePanel';
import { BOSTON_CASE } from './fixtures/boston-office';

/**
 * The phone layout.
 *
 * Under 600 px a panel draws differently: numbered markers on the section
 * instead of 4 px words, cards instead of a five-column table, and a chart
 * drawn at the size it is shown. Three things here are easy to break without
 * a visible symptom on a desk, which is where the tool is developed:
 *
 *   - an UNMEASURED box must be desktop, or every jsdom test and the export's
 *     off-screen copy would take the phone layout;
 *   - the markers must stay inside the drawing and off each other on all six
 *     massings, not just the office they were checked on;
 *   - a marker's number and its card's badge must be the same number.
 */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const result = solve(BOSTON_CASE);
const reference = referenceWatts(
  result.hours.flatMap((h) => [...h.lossTerms, ...h.gainTerms].map((t) => t.watts)),
);
const worst = result.hours[result.worstHour]!;
const terms: SectionTerm[] = [...worst.lossTerms, ...worst.gainTerms];

/** Make every box measure `width`, which is how a phone looks to useWidth. */
const measureAs = (width: number) =>
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 400,
    top: 0,
    left: 0,
    right: width,
    bottom: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

const envelopePanel = () =>
  render(
    <EnvelopePanel
      envelope={DEFAULT_ENVELOPE}
      gains={SAMPLE_GAINS}
      ventilation={DEFAULT_VENTILATION}
      conditions={SAMPLE_CONDITIONS}
      designDay={SAMPLE_DESIGN_DAY}
      units="IP"
      scrubHour={null}
      onChange={vi.fn()}
      onExport={vi.fn()}
      exporting={false}
    />,
  );

const chart = () =>
  render(
    <BalanceChart result={result} floorArea={BOSTON_CASE.envelope.floorArea} units="IP" hoveredHour={null} onHoverHour={vi.fn()} />,
  );

describe('an unmeasured box', () => {
  it('draws the desktop layout — jsdom reports every width as 0', () => {
    const { container } = envelopePanel();
    expect(container.querySelector('svg[data-labels]')!.getAttribute('data-labels')).toBe('text');
    expect(container.querySelector('.env-key')).toBeNull();
    expect(container.querySelector('.env-badge')).toBeNull();
  });

  it('draws the standard chart, 880 wide', () => {
    const { container } = chart();
    const svg = container.querySelector('svg[data-layout]')!;
    expect(svg.getAttribute('data-layout')).toBe('standard');
    expect(svg.getAttribute('viewBox')).toBe('0 0 880 560');
  });
});

describe('a phone-width box', () => {
  it('numbers the drawing and prints the same numbers on the cards and the key', () => {
    measureAs(360);
    const { container } = envelopePanel();

    expect(container.querySelector('svg[data-labels]')!.getAttribute('data-labels')).toBe('markers');
    const onDrawing = [...container.querySelectorAll('[data-marker]')].map((marker) => marker.textContent);
    const inKey = [...container.querySelectorAll('.env-key .env-badge')].map((badge) => badge.textContent);
    expect(onDrawing.length).toBeGreaterThan(0);
    expect(inKey.sort()).toEqual([...onDrawing].sort());

    // The walls card and the walls marker carry one number.
    const wallsMarker = container.querySelector('[data-marker="loss-walls"]')!.textContent;
    const wallsCard = [...container.querySelectorAll('td.env-name')].find((cell) => cell.textContent?.includes('Walls'))!;
    expect(wallsCard.querySelector('.env-badge')!.textContent).toBe(wallsMarker);
  });

  it('draws the chart at the width it is shown, ticking every six hours', () => {
    measureAs(360);
    const { container } = chart();
    const svg = container.querySelector('svg[data-layout]')!;
    expect(svg.getAttribute('data-layout')).toBe('compact');
    expect(svg.getAttribute('viewBox')).toMatch(/^0 0 360 \d+$/);
    // The hour ticks are the centred labels; the axis values beside them are
    // anchored start and end.
    const hours = [...svg.querySelectorAll('text[text-anchor="middle"]')]
      .map((t) => t.textContent)
      .filter((t) => /^\d\d$/.test(t ?? ''));
    expect(hours).toEqual(['00', '06', '12', '18']);
  });

  it('flips at the documented width and not before', () => {
    measureAs(COMPACT_BELOW);
    expect(chart().container.querySelector('svg[data-layout]')!.getAttribute('data-layout')).toBe('standard');
  });
});

describe('marker numbering', () => {
  it('counts only arrows that are drawn, so a zero term leaves no gap', () => {
    const numbers = markerNumbers(OFFICE, terms, reference);
    expect([...numbers.values()]).toEqual(Array.from({ length: numbers.size }, (_, i) => i + 1));
    // The sample office has no exposed floor, and nothing is numbered for it.
    expect(worst.lossTerms.find((t) => t.slot === 'loss-exposed-floor')?.watts ?? 0).toBe(0);
    expect(numbers.has('loss-exposed-floor')).toBe(false);
  });
});

describe('marker placement, on every massing', () => {
  // The radius a 20 px dot has in drawing units on a 330 px phone drawing —
  // the smallest these drawings get, so the largest the dots get.
  const radius = 10 * (1028 / 330);

  for (const type of BUILDING_TYPES) {
    it(`${type.id}: every marker inside the drawing and clear of every other`, () => {
      const spots = markerSpots(type, terms, reference, radius);
      const [minX, minY, width, height] = type.viewBox.split(/\s+/).map(Number) as [number, number, number, number];

      expect(spots.length).toBe(markerNumbers(type, terms, reference).size);
      for (const spot of spots) {
        expect(spot.x - radius).toBeGreaterThanOrEqual(minX - 1e-6);
        expect(spot.y - radius).toBeGreaterThanOrEqual(minY - 1e-6);
        expect(spot.x + radius).toBeLessThanOrEqual(minX + width + 1e-6);
        expect(spot.y + radius).toBeLessThanOrEqual(minY + height + 1e-6);
      }
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          const apart = Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.y - spots[j]!.y);
          expect(apart, `${spots[i]!.slot} and ${spots[j]!.slot}`).toBeGreaterThanOrEqual(radius * 2);
        }
      }
    });
  }
});
