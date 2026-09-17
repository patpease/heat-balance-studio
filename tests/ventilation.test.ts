import { describe, expect, it } from 'vitest';

import { solve } from '../src/engine/balance';
import { ventilationConductance } from '../src/engine/ua';
import { occupantCount } from '../src/engine/gains';
import { airHeatCapacity } from '../src/model/airtightness';
import {
  CUBIC_METRES_PER_SECOND_PER_CFM,
  DEFAULT_VENTILATION,
  HEAT_RECOVERY,
  recoveryMatching,
  ventilationFractions,
} from '../src/model/ventilation';
import { DEFAULT_CONDITIONS, DEFAULT_ENVELOPE, DEFAULT_GAINS } from '../src/model/defaults';
import { SAMPLE_DESIGN_DAY } from '../src/model/sampleProject';
import type { Ventilation } from '../src/model/ventilation';

const run = (v: Partial<Ventilation> = {}) =>
  solve({
    envelope: DEFAULT_ENVELOPE,
    gains: DEFAULT_GAINS,
    conditions: DEFAULT_CONDITIONS,
    designDay: SAMPLE_DESIGN_DAY,
    ventilation: { ...DEFAULT_VENTILATION, ...v },
  });

const ventAt = (r: ReturnType<typeof solve>, hour: number) =>
  r.hours[hour]!.lossTerms.find((t) => t.slot === 'loss-ventilation')!.watts;

/**
 * 62.1 sizes a zone as Rp × people + Ra × area.
 *
 * Both halves, not one or the other: the per-person part is for the occupants
 * and the per-area part is for the space itself, and a room with nobody in it
 * still ventilates for its carpets and finishes.
 */
describe('the ventilation rate', () => {
  it('adds a per-person part to a per-area part', () => {
    const people = occupantCount(DEFAULT_GAINS, DEFAULT_ENVELOPE.floorArea);
    const flow =
      DEFAULT_VENTILATION.perPerson * people + DEFAULT_VENTILATION.perArea * DEFAULT_ENVELOPE.floorArea;
    expect(ventilationConductance(DEFAULT_VENTILATION, DEFAULT_ENVELOPE, people, DEFAULT_CONDITIONS))
      .toBeCloseTo(flow * airHeatCapacity(DEFAULT_CONDITIONS.siteElevation), 9);
  });

  it('defaults to 62.1 office: 5 cfm/person and 0.06 cfm/ft²', () => {
    expect(DEFAULT_VENTILATION.perPerson / CUBIC_METRES_PER_SECOND_PER_CFM).toBeCloseTo(5, 9);
    expect((DEFAULT_VENTILATION.perArea * 0.09290304) / CUBIC_METRES_PER_SECOND_PER_CFM)
      .toBeCloseTo(0.06, 9);
  });

  it('keeps ventilating a building with nobody in it', () => {
    const empty = { ...DEFAULT_VENTILATION, perPerson: 0 };
    expect(ventilationConductance(empty, DEFAULT_ENVELOPE, 0, DEFAULT_CONDITIONS)).toBeGreaterThan(0);
  });

  it('is zero when both rates are zero, and then draws no arrow', () => {
    const none = run({ perPerson: 0, perArea: 0 });
    expect(ventAt(none, 6)).toBe(0);
  });
});

describe('the fan schedule', () => {
  it('runs flat when constant', () => {
    expect(ventilationFractions(DEFAULT_VENTILATION, DEFAULT_GAINS.schedules.occupancy))
      .toEqual(Array.from({ length: 24 }, () => 1));
  });

  it('follows the people when set to occupancy', () => {
    expect(ventilationFractions({ ...DEFAULT_VENTILATION, schedule: 'occupancy' }, DEFAULT_GAINS.schedules.occupancy))
      .toEqual(DEFAULT_GAINS.schedules.occupancy.fractions);
  });

  /**
   * The choice is worth more on a design day than it looks.
   *
   * The verdict lands between 04:00 and 07:00. A constant system is pulling
   * full outdoor air at the coldest hour of the day; one following occupancy is
   * pulling almost none.
   */
  it('changes the answer at the hour the verdict is decided on', () => {
    const constant = run();
    const scheduled = run({ schedule: 'occupancy' });
    expect(ventAt(scheduled, constant.worstHour)).toBeLessThan(ventAt(constant, constant.worstHour));
    expect(scheduled.peakHeatingLoad).toBeLessThan(constant.peakHeatingLoad);
  });

  it('leaves the surfaces untouched either way', () => {
    const walls = (r: ReturnType<typeof solve>) =>
      r.hours[6]!.lossTerms.find((t) => t.slot === 'loss-walls')!.watts;
    expect(walls(run({ schedule: 'occupancy' }))).toBeCloseTo(walls(run()), 9);
  });
});

describe('heat recovery on the air side', () => {
  it('cuts the ventilation term by its effectiveness, and nothing else', () => {
    const none = run();
    const wheel = run({ effectiveness: 0.75, recovery: 'wheel' });
    expect(ventAt(wheel, 6)).toBeCloseTo(ventAt(none, 6) * 0.25, 6);

    const infiltration = (r: ReturnType<typeof solve>) =>
      r.hours[6]!.lossTerms.find((t) => t.slot === 'loss-infiltration')!.watts;
    expect(infiltration(wheel)).toBeCloseTo(infiltration(none), 9);
  });

  it('cannot recover more than there is', () => {
    expect(ventAt(run({ effectiveness: 1 }), 6)).toBe(0);
    // A figure past 1 is a typo, not a perpetual motion machine.
    expect(ventAt(run({ effectiveness: 5 }), 6)).toBe(0);
  });

  it('offers four devices and none, each with a published range', () => {
    expect(HEAT_RECOVERY).toHaveLength(5);
    for (const d of HEAT_RECOVERY) {
      expect(d.effectiveness).toBeGreaterThanOrEqual(0);
      expect(d.effectiveness).toBeLessThanOrEqual(1);
      if (d.id !== 'none') expect(d.range).toMatch(/^\d+–\d+%$/);
    }
  });

  it('takes the middle of each published range, never the top', () => {
    for (const d of HEAT_RECOVERY) {
      if (d.id === 'none') continue;
      const [low, high] = d.range.replace('%', '').split('–').map(Number);
      expect(d.effectiveness * 100).toBeCloseTo((low! + high!) / 2, 0);
      expect(d.effectiveness * 100).toBeLessThan(high!);
    }
  });

  it('badges a typed effectiveness that lands on a device', () => {
    expect(recoveryMatching(0.75)).toBe('wheel');
    expect(recoveryMatching(0.62)).toBeNull();
  });

  it('is what turns this building around', () => {
    // The point of the feature: ventilation without recovery is the largest
    // loss in the table, and with a wheel it is a quarter of that.
    const none = run();
    const wheel = run({ effectiveness: 0.75, recovery: 'wheel' });
    expect(none.lever?.slot).toBe('loss-ventilation');
    expect(wheel.lever?.slot).not.toBe('loss-ventilation');
    expect(wheel.peakHeatingLoad).toBeLessThan(none.peakHeatingLoad);
  });
});

/**
 * The two solves have to be the same solve.
 *
 * `App` and `EnvelopePanel` each call `solve`, and when ventilation was wired
 * only the panel's call got it — so the envelope table updated as the heat
 * recovery changed and the verdict beside it did not. Two answers to the same
 * question, on the same screen, and nothing in the type system objected because
 * the argument is optional by design.
 */
describe('every consumer solves the same problem', () => {
  it('changes the verdict when the recovery changes', () => {
    const none = run();
    const wheel = run({ effectiveness: 0.75, recovery: 'wheel' });
    expect(wheel.peakHeatingLoadPerArea).toBeLessThan(none.peakHeatingLoadPerArea);
    expect(wheel.balancePoint.onMeanGain).toBeLessThan(none.balancePoint.onMeanGain);
  });

  it('passes ventilation from both call sites', async () => {
    // Asserted against the source, because the failure is a missing argument
    // to an optional parameter and there is nothing else to catch it.
    const fs = await import('node:fs');
    for (const file of ['../src/ui/App.tsx', '../src/ui/EnvelopePanel.tsx']) {
      const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
      const call = source.match(/solve\(\{[^}]*\}\)/)![0];
      expect(call, file).toMatch(/ventilation/);
    }
  });
});
