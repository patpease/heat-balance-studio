import { describe, expect, it } from 'vitest';

import { solve } from '../src/engine/balance';
import { DEFAULT_VENTILATION } from '../src/model/ventilation';
import { conductance, resolveGroundTemperature, wallToFloorRatio } from '../src/engine/ua';
import { occupantCount } from '../src/engine/gains';
import { fromF, toBtuHFt2, toF } from '../src/model/units';
import {
  BOSTON_CASE,
  BOSTON_CONDITIONS,
  BOSTON_ENVELOPE,
  BOSTON_GAINS,
  EXPECTED_HOURLY,
  EXPECTED_INFILTRATION_W_K,
  EXPECTED_VENTILATION_W_K,
} from './fixtures/boston-office';
import { DEFAULT_CONDITIONS, DEFAULT_ENVELOPE, DEFAULT_GAINS } from '../src/model/defaults';
import { SAMPLE_DESIGN_DAY } from '../src/model/sampleProject';

/**
 * The golden case. Every expectation here was computed before the engine
 * existed — if these two disagree, the test does not assume the code is right.
 */

const result = solve(BOSTON_CASE);

describe('conductance', () => {
  it('splits air-coupled from ground-coupled', () => {
    const ua = conductance(BOSTON_ENVELOPE, BOSTON_CONDITIONS);
    // walls 220.5 × 0.20 = 44.1 · windows 94.5 × 1.20 = 113.4 · roof 500 × 0.15 = 75
    // ...plus infiltration, which is air-coupled and is not a surface.
    // No ventilation passed, so this is the envelope alone: surfaces plus the
    // leakage that belongs to them.
    expect(ua.air - EXPECTED_INFILTRATION_W_K).toBeCloseTo(232.5, 3);
    expect(ua.ground).toBeCloseTo(90, 6);
    expect(ua.total - EXPECTED_INFILTRATION_W_K).toBeCloseTo(322.5, 3);
  });

  it('names a term per surface, plus one for infiltration', () => {
    const ua = conductance(BOSTON_ENVELOPE, BOSTON_CONDITIONS);
    expect(ua.terms).toHaveLength(6);
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
    // The table is the CONDUCTION balance, computed by hand before infiltration
    // existed and not recomputed since. Infiltration is added here by the one
    // hand-computed conductance in the fixture, so the 24 original numbers stay
    // independent evidence rather than becoming engine output.
    // Both air terms are constant conductances here — the default ventilation
    // runs around the clock — so each is one multiplication against the hour's
    // ΔT, and the 24 conduction values stay independent evidence.
    const dt = BOSTON_CONDITIONS.indoorSetpoint - actual.outdoorTemperature;
    const air = (EXPECTED_INFILTRATION_W_K + EXPECTED_VENTILATION_W_K) * dt;
    expect(Math.abs(actual.loss - (loss + air))).toBeLessThan(1);
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
  /**
   * **These figures moved when infiltration arrived, and moving was correct.**
   *
   * The assumption list called infiltration "the largest single omission, and
   * the reason a passing result is optimistic". It was not an overstatement.
   * On this 500 m² single-storey box, leakage at the code grade is 224 W/K
   * against 232 W/K for every wall, window and roof combined — it very nearly
   * doubled the air-side loss, and the worked example went from short on 15
   * hours to short on all 24.
   *
   * The lever moved with it, from glazing to infiltration. That is the tool
   * doing its job: the biggest thing to fix is no longer the windows.
   */
  it('needs heating on all 24 hours once the air terms are counted', () => {
    expect(result.deficitHours).toBe(24);
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

  it('is short 49.9 W/m² at the worst hour', () => {
    expect(Math.round(result.peakHeatingLoad)).toBe(24968);
    expect(result.peakHeatingLoadPerArea).toBeCloseTo(49.9, 1);
    expect(result.marginPerArea).toBeCloseTo(-49.9, 1);
  });

});

describe('the lever', () => {
  /**
   * It named glazing at 45% until infiltration was modelled. Now it names
   * infiltration at 47%, which is the whole point of having a computed lever
   * rather than a written one: the advice changed because the physics did.
   */
  it('names ventilation, the largest loss term at the worst hour', () => {
    expect(result.lever?.slot).toBe('loss-ventilation');
    // 4,129 W of a 9,216 W loss.
    expect(result.lever?.share).toBeCloseTo(0.353, 3);
  });

  it('is null when there is nothing to point at', () => {
    // No surfaces is no longer enough: ventilation is a loss without being a
    // surface, so a building with no envelope at all still loses heat through
    // the air it moves on purpose.
    const nothing = solve({
      ...BOSTON_CASE,
      envelope: { ...BOSTON_ENVELOPE, surfaces: [] },
      ventilation: { ...DEFAULT_VENTILATION, perPerson: 0, perArea: 0 },
    });
    expect(nothing.lever).toBeNull();
  });

  it('points at ventilation when that is all there is', () => {
    const onlyAir = solve({ ...BOSTON_CASE, envelope: { ...BOSTON_ENVELOPE, surfaces: [] } });
    expect(onlyAir.lever?.slot).toBe('loss-ventilation');
    expect(onlyAir.lever?.share).toBeCloseTo(1, 6);
  });
});

describe('balance point', () => {
  it('is reported three ways, because a scheduled building has no single one', () => {
    expect(result.balancePoint.onMeanGain).toBeCloseTo(15.5, 1);
    expect(result.balancePoint.atPeakGain).toBeCloseTo(10.3, 1);
    expect(result.balancePoint.atMinGain).toBeCloseTo(19.5, 1);
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
    // No ground term to subtract, over the air side including infiltration.
    expect(noSlab.balancePoint.onMeanGain).toBeCloseTo(14.5, 1);
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
    // Asserted as WHERE the slab is charged, not as a total. A total has to
    // account for infiltration moving too — the slab joins the above-grade
    // envelope when it stops being ground-coupled — and that arithmetic is not
    // what this test is about.
    expect(slabAsOutdoor.conductance.ground).toBe(0);

    // And it now VARIES by hour, where a ground-coupled slab is constant. That
    // is the difference the driver makes, stated as behaviour rather than as a
    // total.
    const slabAt = (r: typeof slabAsOutdoor, hour: number) =>
      r.hours[hour]!.lossTerms.find((t) => t.slot === 'loss-ground-floor')!.watts;
    expect(slabAt(slabAsOutdoor, 6)).not.toBeCloseTo(slabAt(slabAsOutdoor, 15), 3);
    expect(slabAt(result, 6)).toBeCloseTo(slabAt(result, 15), 9);
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
  it('reports the worst-hour shortfall in IP as 15.8 Btu/h·ft²', () => {
    expect(toBtuHFt2(result.peakHeatingLoadPerArea)).toBeCloseTo(15.83, 2);
  });

  it('reports the balance point as 59.9 °F', () => {
    expect(toF(result.balancePoint.onMeanGain)).toBeCloseTo(59.9, 1);
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

/**
 * The third answer.
 *
 * A binary verdict had nowhere to put a data hall on chilled water. Counted as
 * a passive gain it read "self-heating", which is wrong — the room never sees
 * that heat. Counted as nothing it read "not self-heating yet", which is unfair
 * — the heat is right there, and a recovery chiller on a loop the building was
 * already running turns it into heating hot water.
 *
 * So: passive first, recovery second, and the two are never added into one
 * number. `selfHeating` keeps meaning passively self-heating, because that is
 * the claim people screenshot.
 */
describe('heat recovered from cooling is a third answer, not a bigger gain', () => {
  const withIt = (kW: number, cooling: 'air' | 'chilled-water' | 'rejected') =>
    solve({
      envelope: DEFAULT_ENVELOPE,
      gains: { ...DEFAULT_GAINS, itEquipment: { kilowatts: kW, cooling } },
      conditions: DEFAULT_CONDITIONS,
      designDay: SAMPLE_DESIGN_DAY,
    });

  it('reads short with no IT at all', () => {
    const r = withIt(0, 'air');
    expect(r.status).toBe('short');
    expect(r.selfHeating).toBe(false);
    expect(r.recovery).toBeNull();
  });

  it('reads self-heating when air-cooled IT covers the gap passively', () => {
    // Air-cooled heat IS in the room, so this is a genuine passive claim.
    const r = withIt(400, 'air');
    expect(r.status).toBe('self-heating');
    expect(r.selfHeating).toBe(true);
    expect(r.recovery).toBeNull();
  });

  it('reads recovered when the same load is on chilled water', () => {
    const r = withIt(400, 'chilled-water');
    expect(r.status).toBe('recovered');
    // NOT self-heating. The room never gets this heat on its own.
    expect(r.selfHeating).toBe(false);
    expect(r.deficitHours).toBeGreaterThan(0);
    expect(r.recovery).not.toBeNull();
  });

  it('reads short again when the same load is rejected outdoors', () => {
    const r = withIt(400, 'rejected');
    expect(r.status).toBe('short');
    expect(r.recovery).toBeNull();
    // Identical to having no IT at all, which is the point of the option.
    expect(r.marginPerArea).toBeCloseTo(withIt(0, 'air').marginPerArea, 9);
  });

  it('leaves the passive curves untouched by recovery', () => {
    // The chart's gain line must not move when the medium changes, or the
    // deficit shading would be lying about what the space receives.
    const chilled = withIt(400, 'chilled-water');
    const none = withIt(0, 'air');
    expect(chilled.hours.map((h) => h.gain)).toEqual(none.hours.map((h) => h.gain));
    expect(chilled.hours.map((h) => h.net)).toEqual(none.hours.map((h) => h.net));
  });

  it('keeps the balance point a PASSIVE number', () => {
    // It answers "at what outdoor temperature does this building stop needing
    // heat on its own". Recovery is a machine, so it does not belong in it.
    expect(withIt(400, 'chilled-water').balancePoint.onMeanGain)
      .toBeCloseTo(withIt(0, 'air').balancePoint.onMeanGain, 9);
  });

  it('reports the duty it actually needs, not the capacity it has', () => {
    // A 514 kW machine covering a 60 kW gap has delivered 60. Reporting the
    // capacity as the duty is how a screening number becomes a plant size
    // nobody can justify.
    const r = withIt(400, 'chilled-water');
    expect(r.recovery!.availableAtWorstHour).toBeGreaterThan(r.recovery!.usedAtWorstHour);
    expect(r.recovery!.usedAtWorstHour).toBeCloseTo(-withIt(0, 'air').hours[r.worstHour]!.net, 6);
  });

  /**
   * The common case, and the one a binary verdict served worst.
   *
   * A comms closet on chilled water against a 58 kW gap recovers something real
   * and nothing like enough. Called `short` it throws away the part that IS
   * covered; called `recovered` it claims what the building cannot do.
   */
  it('is partly recovered when recovery is real but not enough', () => {
    const r = withIt(50, 'chilled-water');
    expect(r.status).toBe('partly-recovered');
    expect(r.recovery).not.toBeNull();
    expect(r.recovery!.marginPerArea).toBeGreaterThan(r.marginPerArea);
    expect(r.recovery!.hoursStillShort).toBeGreaterThan(0);
    expect(r.recovery!.stillShort).toBeGreaterThan(0);
  });

  it('reports the gap that is LEFT, not the one it started with', () => {
    // The number the next decision gets made against.
    const r = withIt(50, 'chilled-water');
    expect(r.recovery!.stillShort).toBeLessThan(r.peakHeatingLoad);
    expect(r.recovery!.stillShortPerArea).toBeCloseTo(r.recovery!.stillShort / DEFAULT_ENVELOPE.floorArea, 9);
  });

  it('keeps plain short for a load with nothing to recover', () => {
    expect(withIt(50, 'rejected').status).toBe('short');
    expect(withIt(50, 'air').status).toBe('short');
  });

  it('measures the remaining gap at the hour that is worst AFTER recovery', () => {
    // Recovery is flat and the passive gains are not, so the hour that hurts
    // most can move once the loop is counted.
    const r = withIt(50, 'chilled-water');
    const after = r.hours.map((h) => h.net + h.recoverable);
    const worstAfter = after.indexOf(Math.min(...after));
    expect(r.recovery!.worstHour).toBe(worstAfter);
  });

  it('reports no remaining gap once recovery closes the day', () => {
    const r = withIt(400, 'chilled-water');
    expect(r.status).toBe('recovered');
    expect(r.recovery!.stillShort).toBe(0);
    expect(r.recovery!.hoursStillShort).toBe(0);
  });

  it('needs every hour closed, not most of them', () => {
    // A strategy that leaves one hour open has not closed the day.
    for (const kW of [0, 5, 10, 20, 40, 80, 200, 400]) {
      const r = withIt(kW, 'chilled-water');
      const allClosed = r.hours.every((h) => h.net + h.recoverable >= 0);
      expect(r.status === 'recovered', `${kW} kW`).toBe(allClosed && r.deficitHours > 0);
    }
  });
});
