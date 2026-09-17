import { describe, expect, it } from 'vitest';

import { resolveGroundTemperature } from '../src/engine/ua';
import { GROUND_FREEZING_FLOOR_C, GROUND_RULE_OF_THUMB_C } from '../src/model/defaults';
import { fromF, toF } from '../src/model/units';

/**
 * The ground temperature, against measured soil.
 *
 * Every figure below is a real measurement, not a modelled one: soil
 * temperatures are January 2026 monthly means from soiltemps.com (USCRN/SCAN
 * station records), and the air means are ten-year monthly normals from the
 * same ERA5 record the tool derives its design days from. The point of the
 * test is that the resolver lands near the measurement in three climates that
 * behave differently — which the annual mean it replaced did not.
 */
const airMean = { houston: 53.4, boston: 29.9, minneapolis: 16.5 } as const;
const soil4in = { houston: 54.7, boston: 33.2, minneapolis: 28.1 } as const;

const resolveF = (f: number) => toF(resolveGroundTemperature(fromF(f)).value);

describe('the ground temperature follows the design month', () => {
  /**
   * The case that forced the change. Houston's ANNUAL mean is 70.1 °F, so the
   * old resolver put the ground 15 °F above the measured soil and invented a
   * slab gain on a heating design day.
   */
  it('lands on the rule of thumb in Houston, within 2 °F of measured soil', () => {
    const resolved = resolveGroundTemperature(fromF(airMean.houston));
    expect(resolved.basis).toBe('rule-of-thumb');
    expect(resolved.value).toBe(GROUND_RULE_OF_THUMB_C);
    expect(Math.abs(toF(resolved.value) - soil4in.houston)).toBeLessThan(2);
  });

  /**
   * Boston floors too — its January air averages 29.9 °F, two degrees below
   * freezing — and the floor is what makes it right: held at 32 °F it sits
   * 1.2 °F from the measured soil, where the air mean would have been 3.3 low
   * and the old annual-mean basis was 18 high.
   */
  it('leaves the rule of thumb behind in Boston, and lands within 2 °F', () => {
    const resolved = resolveGroundTemperature(fromF(airMean.boston));
    expect(resolved.basis).toBe('derived');
    expect(resolved.floored).toBe(true);
    expect(Math.abs(toF(resolved.value) - soil4in.boston)).toBeLessThan(2);
  });

  /**
   * Minneapolis is why the floor exists. Its January air averages 16.5 °F while
   * its soil sits at 28.1 °F at 4", 30.5 at 8" and 34.4 at 20" — the air mean
   * is below anything measurable in the ground, because snow insulates and
   * freezing soil moisture holds the temperature while it changes phase.
   */
  it('floors Minneapolis at freezing rather than following the air down', () => {
    const resolved = resolveGroundTemperature(fromF(airMean.minneapolis));
    expect(resolved.floored).toBe(true);
    expect(resolved.value).toBe(GROUND_FREEZING_FLOOR_C);
    expect(toF(resolved.value)).toBeCloseTo(32, 6);
    expect(Math.abs(toF(resolved.value) - soil4in.minneapolis)).toBeLessThan(4);
    // And the unfloored figure would have been wrong by three times as much.
    expect(Math.abs(airMean.minneapolis - soil4in.minneapolis)).toBeGreaterThan(11);
  });

  it('reports the floor, because a number held at 32 °F is not one the weather made', () => {
    expect(resolveGroundTemperature(fromF(20)).floored).toBe(true);
    expect(resolveGroundTemperature(fromF(40)).floored).toBe(false);
  });

  /**
   * The drift that decides the rule of thumb is measured from the FLOORED
   * figure. Measuring it from the raw air mean would be measuring a distance to
   * a temperature the ground never reaches.
   */
  it('measures drift from the floored figure, not from the air', () => {
    // −40 °F and 20 °F are 60 °F apart in the air and identical in the ground,
    // so they must report the same drift: the distance from freezing to the
    // rule of thumb, and nothing to do with how cold the air got.
    const arctic = resolveGroundTemperature(fromF(-40));
    const merelyCold = resolveGroundTemperature(fromF(20));
    const fromFreezing = GROUND_RULE_OF_THUMB_C - GROUND_FREEZING_FLOOR_C;
    expect(arctic.value).toBe(GROUND_FREEZING_FLOOR_C);
    expect(arctic.drift).toBeCloseTo(fromFreezing, 9);
    expect(arctic.drift).toBeCloseTo(merelyCold.drift, 9);
  });

  it('keeps the rule of thumb across the band it was always good for', () => {
    expect(resolveF(53)).toBeCloseTo(55, 6);
    expect(resolveF(57)).toBeCloseTo(55, 6);
    // Miami: 69 °F in January, and genuinely warmer ground than the default.
    expect(resolveF(69.1)).toBeCloseTo(69.1, 1);
  });
});
