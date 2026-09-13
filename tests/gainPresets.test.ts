import { describe, expect, it } from 'vitest';

import { solve } from '../src/engine/balance';
import { applyGainPreset, setDensity } from '../src/model/editGains';
import { DEFAULT_GAINS, OFFICE_PRESET } from '../src/model/defaults';
import { GAIN_PRESETS, presetById, SCHEDULES_ARE_PROVISIONAL } from '../src/model/gainPresets';
import {
  SAMPLE_CONDITIONS,
  SAMPLE_DESIGN_DAY,
  SAMPLE_ENVELOPE,
  SAMPLE_GAINS,
} from '../src/model/sampleProject';
import { BTU_H_PER_WATT, SQFT_PER_SQM } from '../src/model/units';

/**
 * The presets are GENERATED from docs/gain-data/. These tests guard the two
 * things generation can silently get wrong: the unit conversion, and the
 * citation travelling with the number it describes.
 */

describe('the sheet arrives in canonical SI', () => {
  it('converted the office row exactly', () => {
    // The sheet says 275 ft²/person, 200 Btu/h, 0.64 W/ft², 0.75 W/ft².
    expect(OFFICE_PRESET.areaPerPerson.value).toBeCloseTo(275 / SQFT_PER_SQM, 6);
    expect(OFFICE_PRESET.sensiblePerPerson.value).toBeCloseTo(200 / BTU_H_PER_WATT, 6);
    expect(OFFICE_PRESET.lighting.value).toBeCloseTo(0.64 * SQFT_PER_SQM, 6);
    expect(OFFICE_PRESET.miscEquipment.value).toBeCloseTo(0.75 * SQFT_PER_SQM, 6);
  });

  it('did not convert a density with the area factor, or an area with the density factor', () => {
    // Both are ~10.76 but they run in OPPOSITE directions: ft²/person divides,
    // W/ft² multiplies. Swapping them is a 116x error that still looks like a
    // number, so pin the direction rather than the magnitude.
    expect(OFFICE_PRESET.areaPerPerson.value!).toBeLessThan(275);
    expect(OFFICE_PRESET.lighting.value!).toBeGreaterThan(0.64);
  });

  it('keeps every density non-negative and finite', () => {
    for (const preset of GAIN_PRESETS) {
      for (const key of ['areaPerPerson', 'sensiblePerPerson', 'lighting', 'miscEquipment', 'itEquipment'] as const) {
        const { value } = preset[key];
        if (value === null) continue;
        expect(Number.isFinite(value), `${preset.id}.${key}`).toBe(true);
        expect(value, `${preset.id}.${key}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('carries all thirteen building types, each with a unique id and a label', () => {
    expect(GAIN_PRESETS).toHaveLength(13);
    expect(new Set(GAIN_PRESETS.map((p) => p.id)).size).toBe(13);
    for (const preset of GAIN_PRESETS) expect(preset.label.length).toBeGreaterThan(0);
  });
});

describe('a number badged with a standard carries its citation', () => {
  it('never ships a density with an empty or UNVERIFIED source', () => {
    for (const preset of GAIN_PRESETS) {
      for (const key of ['areaPerPerson', 'sensiblePerPerson', 'lighting', 'miscEquipment'] as const) {
        expect(preset[key].citation, `${preset.id}.${key}`).not.toBe('');
        expect(preset[key].citation, `${preset.id}.${key}`).not.toMatch(/^UNVERIFIED/i);
        expect(preset[key].citation, `${preset.id}.${key}`).not.toBe('UNCITED');
      }
    }
  });

  it('does not attribute a zero IT default to a standard', () => {
    // The sheet leaves IT blank for twelve of thirteen types. Blank is "no
    // default", and dressing that as an ASHRAE zero would be a claim the sheet
    // never made.
    for (const preset of GAIN_PRESETS) {
      if (preset.itEquipment.value === 0) {
        expect(preset.itEquipment.citation, preset.id).not.toMatch(/ASHRAE|90\.1/i);
      }
    }
  });
});

describe('applying a preset', () => {
  const warehouse = presetById('warehouse')!;

  it('finds every type by id', () => {
    for (const preset of GAIN_PRESETS) expect(presetById(preset.id)).toBe(preset);
    expect(presetById('not-a-building')).toBeUndefined();
  });

  it('replaces all four densities and sets the badge', () => {
    const next = applyGainPreset(DEFAULT_GAINS, warehouse);
    expect(next.occupancy.areaPerPerson).toBeCloseTo(warehouse.areaPerPerson.value!, 9);
    expect(next.occupancy.sensiblePerPerson).toBeCloseTo(warehouse.sensiblePerPerson.value!, 9);
    expect(next.lighting.powerDensity).toBeCloseTo(warehouse.lighting.value!, 9);
    expect(next.miscEquipment.powerDensity).toBeCloseTo(warehouse.miscEquipment.value!, 9);
    expect(next.preset).toBe('Warehouse');
  });

  it('is the one edit path that SETS the badge rather than clearing it', () => {
    // Everything else in editGains drops the badge, because the number stopped
    // being the standard's. A preset makes it the standard's again.
    const edited = setDensity(DEFAULT_GAINS, 'lighting', 99);
    expect(edited.preset).toBeNull();
    expect(applyGainPreset(edited, warehouse).preset).toBe('Warehouse');
  });

  it('leaves the schedules alone, including ones the user dragged', () => {
    // There are no per-type profiles yet, and a user comparing types should not
    // lose the strip they shaped.
    const next = applyGainPreset(DEFAULT_GAINS, warehouse);
    expect(next.schedules.occupancy).toBe(DEFAULT_GAINS.schedules.occupancy);
    expect(next.schedules.lighting).toBe(DEFAULT_GAINS.schedules.lighting);
    expect(next.schedules.itEquipment).toBe(DEFAULT_GAINS.schedules.itEquipment);
  });

  it('holds phi, which v1 does not expose', () => {
    expect(applyGainPreset(DEFAULT_GAINS, warehouse).itEquipment.spaceFraction).toBe(1);
  });
});

describe('the building type changes the answer', () => {
  const solveWith = (presetId: string) => {
    const preset = presetById(presetId)!;
    return solve({
      envelope: SAMPLE_ENVELOPE,
      gains: applyGainPreset(SAMPLE_GAINS, preset),
      conditions: SAMPLE_CONDITIONS,
      designDay: SAMPLE_DESIGN_DAY,
    });
  };

  it('gives a warehouse a worse balance point than a restaurant', () => {
    // A restaurant is 100 ft²/person against a warehouse's 1,500, and carries
    // four times the lighting. If the picker were wired to nothing, these two
    // would come back identical — which is the failure this test exists for.
    const warehouse = solveWith('warehouse');
    const restaurant = solveWith('restaurant');
    expect(restaurant.balancePoint.onMeanGain).toBeLessThan(warehouse.balancePoint.onMeanGain);
  });

  it('gives thirteen distinct answers, not one repeated thirteen times', () => {
    const points = GAIN_PRESETS.map((p) => solveWith(p.id).balancePoint.onMeanGain.toFixed(3));
    expect(new Set(points).size).toBeGreaterThan(10);
  });

  it('leaves the envelope alone — this picker moves gains only', () => {
    const before = solveWith('office');
    const after = solveWith('warehouse');
    expect(after.hours[0]!.loss).toBeCloseTo(before.hours[0]!.loss, 9);
    expect(after.hours[0]!.gain).not.toBeCloseTo(before.hours[0]!.gain, 3);
  });
});

describe('the provisional-schedule flag is honest', () => {
  it('is set while every preset shares the office profile', () => {
    // When sheet 2 lands and schedules become per-type, this flag comes out and
    // so does the line in the UI. Until then it must stay true.
    expect(SCHEDULES_ARE_PROVISIONAL).toBe(true);
  });
});
