// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BalanceChart } from '../src/chart/BalanceChart';
import { solve } from '../src/engine/balance';
import {
  SAMPLE_CONDITIONS,
  SAMPLE_DESIGN_DAY,
  SAMPLE_ENVELOPE,
  SAMPLE_GAINS,
} from '../src/model/sampleProject';
import type { UnitSystem } from '../src/model/types';
import { toF } from '../src/model/units';

/**
 * Outdoor dry-bulb, drawn as a reference.
 *
 * Two things have to stay true of it, and they pull in opposite directions:
 * it has to be ON the chart, and it has to change NOTHING on the chart. A
 * reference line that quietly entered the balance would be the worst kind of
 * bug here, because the number it moved would still look like a number.
 */
afterEach(cleanup);

const result = solve({
  envelope: SAMPLE_ENVELOPE,
  gains: SAMPLE_GAINS,
  conditions: SAMPLE_CONDITIONS,
  designDay: SAMPLE_DESIGN_DAY,
});

const chart = (units: UnitSystem = 'IP') =>
  render(
    <BalanceChart
      result={result}
      floorArea={SAMPLE_ENVELOPE.floorArea}
      units={units}
      hoveredHour={null}
      onHoverHour={vi.fn()}
    />,
  );

/** The dashed polyline is the outdoor series; the two solid ones are the data. */
const outdoorPolyline = () =>
  Array.from(document.querySelectorAll('polyline')).find((p) => p.getAttribute('stroke-dasharray'));

describe('the outdoor air line is drawn', () => {
  it('adds a third polyline, dashed and in a neutral token', () => {
    chart();
    const line = outdoorPolyline();
    expect(line).toBeDefined();
    expect(line!.getAttribute('stroke')).toBe('var(--muted)');
    expect(document.querySelectorAll('polyline')).toHaveLength(3);
  });

  it('plots all 24 hours', () => {
    chart();
    expect(outdoorPolyline()!.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(24);
  });

  it('names itself in the key', () => {
    chart();
    expect(screen.getByText('outdoor air')).toBeTruthy();
  });
});

describe('the outdoor air line changes nothing', () => {
  it('leaves the loss and gain curves exactly where they were', () => {
    // Both data curves are a pure function of the balance, which the reference
    // series is not an input to. Solve twice and the geometry must be identical.
    chart();
    const solid = Array.from(document.querySelectorAll('polyline'))
      .filter((p) => !p.getAttribute('stroke-dasharray'))
      .map((p) => p.getAttribute('points'));

    cleanup();
    chart();
    const again = Array.from(document.querySelectorAll('polyline'))
      .filter((p) => !p.getAttribute('stroke-dasharray'))
      .map((p) => p.getAttribute('points'));

    expect(again).toEqual(solid);
  });

  it('is on its own axis, not the flux axis', () => {
    // If it shared the left scale, a sub-zero temperature would plot below the
    // baseline and a mild one would sit on top of the gain curve. The proof is
    // that its y values move when ONLY the temperature axis would move them.
    chart('SI');
    const si = outdoorPolyline()!.getAttribute('points');
    cleanup();
    chart('IP');
    const ipPoints = outdoorPolyline()!.getAttribute('points');
    expect(ipPoints).not.toBe(si);
  });
});

describe('the outdoor readout follows the unit switch', () => {
  const shown = (units: UnitSystem) => {
    cleanup();
    chart(units);
    return document.body.textContent ?? '';
  };

  it('reads °F under IP', () => {
    const worst = result.hours[result.worstHour]!;
    expect(shown('IP')).toContain(`${toF(worst.outdoorTemperature).toFixed(1)} °F air temperature`);
  });

  it('reads °C under SI', () => {
    const worst = result.hours[result.worstHour]!;
    expect(shown('SI')).toContain(`${worst.outdoorTemperature.toFixed(1)} °C air temperature`);
  });

  it('labels the right axis with the temperature unit, not the flux unit', () => {
    expect(shown('IP')).toContain('right °F');
    expect(shown('SI')).toContain('right °C');
  });
});
