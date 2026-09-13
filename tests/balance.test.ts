import { describe, expect, it } from 'vitest';

import { solve } from '../src/engine/balance';
import { conductance, resolveGroundTemperature, wallToFloorRatio } from '../src/engine/ua';
import { occupantCount } from '../src/engine/gains';
import { fromF, toBtuHFt2, toF } from '../src/model/units';
import { BOSTON_CASE, BOSTON_ENVELOPE, BOSTON_GAINS, EXPECTED_HOURLY } from './fixtures/boston-office';

/**
 * The golden case. Every expectation here was computed before the engine
 * existed — if these two disagree, the test does not assume the code is right.
 */

const result = solve(BOSTON_CASE);

describe('conductance', () => {
  it('splits air-coupled from ground-coupled', () => {
    const ua = conductance(BOSTON_ENVELOPE);
    // walls 220.5 × 0.20 = 44.1 · windows 94.5 × 1.20 = 113.4 · roof 500 × 0.15 = 75
    expect(ua.air).toBeCloseTo(232.5, 6);
    expect(ua.ground).toBeCloseTo(90, 6);
    expect(ua.total).toBeCloseTo(322.5, 6);
  });

  it('names a term per surface, including the zero-area one', () => {
    const ua = conductance(BOSTON_ENVELOPE);
    expect(ua.terms).toHaveLength(5);
    const exposed = ua.terms.find((t) => t.slot === 'loss-exposed-floor');
    // A zero-area surface still produces a term. The drawing needs to know the
    // category exists in order to show it as an empty slot rather than omit it.
    expect(exposed?.conductance).toBe(0);
  });
});

describe('wall-to-floor ratio', () => {
  it('counts glazing as wall, and divides by floor area', () => {
    // (220.5 + 94.5) / 500
    expect(wallToFloorRatio(BOSTON_ENVELOPE)).toBeCloseTo(0.63, 10);
  });

  it('is zero rather than Infinity when floor area is zero', () => {
    expect(wallToFloorRatio({ ...BOSTON_ENVELOPE, floorArea: 0 })).toBe(0);
  });
});

describe('occupants', () => {
  it('derives a headcount from the density', () => {
    expect(occupantCount(BOSTON_GAINS, 500)).toBeCloseTo(27, 10);
  });

  it('takes the entered count when the mode says so', () => {
    const gains = { ...BOSTON_GAINS, occupancy: { ...BOSTON_GAINS.occupancy, mode: 'count' as const, count: 40 } };
    expect(occupantCount(gains, 500)).toBe(40);
  });
});

describe('the hourly balance reproduces the fixture to the watt', () => {
  /**
   * Agreement within a watt, not bit-identity.
   *
   * `0.35 × 7.0 × 500` and `(7.0 × 500) × 0.35` differ in the last bit — the
   * first lands on 1224.9999999999998 and the second on 1225.0000000000002, so
   * an hour whose true total sits exactly on 1887.5 rounds to 1887 one way and
   * 1888 the other. Asserting on `Math.round` makes the test a hostage to
   * multiplication order rather than to the physics.
   *
   * A watt of tolerance is generous against the real precision here: U-values
   * are entered to two decimals and schedules to two, so sub-watt agreement in
   * a 9,000 W calculation is meaningless either way.
   */
  it.each(EXPECTED_HOURLY)('hour $hour', ({ hour, loss, gain }) => {
    const actual = result.hours[hour]!;
    expect(actual.hour).toBe(hour);
    expect(Math.abs(actual.loss - loss)).toBeLessThan(1);
    expect(Math.abs(actual.gain - gain)).toBeLessThan(1);
  });

  it('loss terms sum to the hour total', () => {
    for (const hour of result.hours) {
      const summed = hour.lossTerms.reduce((a, t) => a + t.watts, 0);
      expect(summed).toBeCloseTo(hour.loss, 6);
    }
  });

  it('gain terms sum to the hour total', () => {
    for (const hour of result.hours) {
      const summed = hour.gainTerms.reduce((a, t) => a + t.watts, 0);
      expect(summed).toBeCloseTo(hour.gain, 6);
    }
  });
});

describe('the verdict', () => {
  it('needs heating on 15 of 24 hours', () => {
    expect(result.deficitHours).toBe(15);
    expect(result.selfHeating).toBe(false);
  });

  it('is decided at 06:00, in the pre-occupancy window', () => {
    // On the corrected local-standard clock the worst NET hour and the coldest
    // hour coincide at 06:00. They did not before phase 02 — the profile was an
    // hour late and the worst hour appeared to fall before the coldest one,
    // which was an artefact of the timezone bug and not a property of the
    // building.
    expect(result.worstHour).toBe(6);
    const coldest = result.hours.reduce((a, h) =>
      h.outdoorTemperature < a.outdoorTemperature ? h : a,
    );
    expect(coldest.hour).toBe(6);
  });

  it('shows the schedule mattering as much as the weather', () => {
    // The real finding, and it survives the correction. 07:00 is only 0.65 K
    // milder than 06:00, but its net is 1,800 W better — almost all of that is
    // occupancy starting, not the weather easing.
    const six = result.hours[6]!;
    const seven = result.hours[7]!;
    expect(seven.outdoorTemperature - six.outdoorTemperature).toBeLessThan(1);
    expect(seven.net - six.net).toBeGreaterThan(1500);
    expect(seven.gain - six.gain).toBeGreaterThan(seven.loss - six.loss);
  });

  it('is short 14.7 W/m² at the worst hour', () => {
    expect(Math.round(result.peakHeatingLoad)).toBe(7328);
    expect(result.peakHeatingLoadPerArea).toBeCloseTo(14.7, 1);
    expect(result.marginPerArea).toBeCloseTo(-14.7, 1);
  });

});

describe('the lever', () => {
  it('names glazing, the largest loss term at the worst hour', () => {
    expect(result.lever?.slot).toBe('loss-windows');
    // 4,129 W of a 9,216 W loss.
    expect(result.lever?.share).toBeCloseTo(0.448, 3);
  });

  it('is null when there is nothing to point at', () => {
    const nothing = solve({
      ...BOSTON_CASE,
      envelope: { ...BOSTON_ENVELOPE, surfaces: [] },
    });
    expect(nothing.lever).toBeNull();
  });
});

describe('balance point', () => {
  it('is reported three ways, because a scheduled building has no single one', () => {
    expect(result.balancePoint.onMeanGain).toBeCloseTo(3.8, 1);
    expect(result.balancePoint.atPeakGain).toBeCloseTo(-12.2, 1);
    expect(result.balancePoint.atMinGain).toBeCloseTo(16.2, 1);
  });

  it('subtracts the constant ground loss rather than charging it to the air side', () => {
    // Removing the slab removes a constant 750 W of loss, which makes the
    // building BETTER — so it needs heating only at colder outdoor
    // temperatures, and the balance point FALLS. Lower is better here, which is
    // the opposite of the intuition the number's sign invites.
    const noSlab = solve({
      ...BOSTON_CASE,
      envelope: {
        ...BOSTON_ENVELOPE,
        surfaces: BOSTON_ENVELOPE.surfaces.filter((s) => s.boundary !== 'ground'),
      },
    });
    expect(noSlab.balancePoint.onMeanGain).toBeLessThan(result.balancePoint.onMeanGain);
    // 21.111 − 4766/232.5, with no ground term to subtract.
    expect(noSlab.balancePoint.onMeanGain).toBeCloseTo(0.6, 1);
  });

  it('charges a ground-coupled surface to the ground, not to the air side', () => {
    // Re-declaring the slab as an outdoor surface must raise the balance point:
    // its loss now scales with the design day instead of sitting constant, and
    // 90 W/K lands on UA_air.
    const slabAsOutdoor = solve({
      ...BOSTON_CASE,
      envelope: {
        ...BOSTON_ENVELOPE,
        surfaces: BOSTON_ENVELOPE.surfaces.map((s) =>
          s.boundary === 'ground' ? { ...s, boundary: 'air' as const } : s,
        ),
      },
    });
    expect(slabAsOutdoor.conductance.air).toBeCloseTo(322.5, 6);
    expect(slabAsOutdoor.conductance.ground).toBe(0);
    expect(slabAsOutdoor.peakHeatingLoad).toBeGreaterThan(result.peakHeatingLoad);
  });
});

describe('gain summary', () => {
  it('peaks at 8,499 W and floors at 1,887 W overnight', () => {
    expect(result.peakGain).toBeCloseTo(8499, 0);
    expect(result.minGain).toBeCloseTo(1887.5, 0);
    expect(result.meanGain).toBeCloseTo(4766, 0);
  });

  it('leaves IT as the only gain still working at the worst hour', () => {
    const worst = result.hours[result.worstHour]!;
    const people = worst.gainTerms.find((t) => t.slot === 'gain-people')!;
    const it = worst.gainTerms.find((t) => t.slot === 'gain-it-equipment')!;
    // People is exactly zero at 06:00 — the drawing must render no arrow at all
    // rather than a stub.
    expect(people.watts).toBe(0);
    expect(it.watts).toBe(500);
  });
});

describe('the design condition converts for display without changing', () => {
  it('reports the worst-hour shortfall in IP as 4.6 Btu/h·ft²', () => {
    expect(toBtuHFt2(result.peakHeatingLoadPerArea)).toBeCloseTo(4.65, 2);
  });

  it('reports the balance point as 38.9 °F', () => {
    expect(toF(result.balancePoint.onMeanGain)).toBeCloseTo(38.9, 1);
  });
});

describe('ground temperature resolver', () => {
  it('keeps the rule of thumb for Boston, 1.9 K inside the limit', () => {
    const r = resolveGroundTemperature(10.9);
    expect(r.basis).toBe('rule-of-thumb');
    expect(toF(r.value)).toBeCloseTo(55, 6);
  });

  it('keeps it for Denver at 2.9 K — the closest call that still holds', () => {
    expect(resolveGroundTemperature(9.8).basis).toBe('rule-of-thumb');
  });

  it('switches to the derived mean for Minneapolis, where 55 °F flatters', () => {
    const r = resolveGroundTemperature(8.1);
    expect(r.basis).toBe('derived');
    expect(r.value).toBe(8.1);
  });

  it('switches for Miami, where 55 °F invents a loss that is really a gain', () => {
    const r = resolveGroundTemperature(25.0);
    expect(r.basis).toBe('derived');
    expect(r.value).toBe(25.0);
  });

  it('holds the rule of thumb right up to the threshold, and switches past it', () => {
    const at = fromF(55) - 3;
    expect(resolveGroundTemperature(at).basis).toBe('rule-of-thumb');
    expect(resolveGroundTemperature(at - 0.001).basis).toBe('derived');
  });
});
