import { describe, expect, it } from 'vitest';

import { solve } from '../src/engine/balance';
import { applyGainPreset, setDensity } from '../src/model/editGains';
import { DEFAULT_GAINS, OFFICE_PRESET } from '../src/model/defaults';
import { BUILDING_TYPES } from '../src/model/buildingTypes';
import { DEFAULT_PRESET_ID, GAIN_PRESETS, presetById } from '../src/model/gainPresets';
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
  it('converted the Medium Office row exactly', () => {
    // The sheet says 200 ft²/person, 200 Btu/h, 0.64 W/ft², 1.061 W/ft².
    const medium = presetById('office-medium')!;
    expect(medium.areaPerPerson.value).toBeCloseTo(200 / SQFT_PER_SQM, 6);
    expect(medium.sensiblePerPerson.value).toBeCloseTo(200 / BTU_H_PER_WATT, 6);
    expect(medium.lighting.value).toBeCloseTo(0.64 * SQFT_PER_SQM, 6);
    expect(medium.miscEquipment.value).toBeCloseTo(1.061 * SQFT_PER_SQM, 6);
  });

  it('opens on Large Office', () => {
    // The tool used to load the worked example's own densities, which are the
    // original unsourced placeholders — the picker read "not a listed type" on
    // first paint. Whatever it opens on must be a real building type.
    expect(DEFAULT_PRESET_ID).toBe('office-large');
    expect(OFFICE_PRESET.id).toBe('office-large');
    expect(OFFICE_PRESET.label).toBe('Large Office');
    expect(DEFAULT_GAINS.preset).toBe('Large Office');
    expect(GAIN_PRESETS.some((p) => p.id === DEFAULT_PRESET_ID)).toBe(true);
  });

  it('takes lighting from 90.1 and everything else from PNNL', () => {
    // The deliberate split. PNNL is the 2004 vintage, whose lighting runs well
    // above current code, and overstated lighting flatters every answer here.
    expect(OFFICE_PRESET.lighting.citation).toMatch(/Building Area Method/);
    expect(OFFICE_PRESET.lighting.citation).not.toMatch(/PNNL/);
    expect(OFFICE_PRESET.miscEquipment.citation).toMatch(/PNNL/);
    expect(OFFICE_PRESET.areaPerPerson.citation).toMatch(/PNNL/);
  });

  it('did not convert a density with the area factor, or an area with the density factor', () => {
    // Both are ~10.76 but they run in OPPOSITE directions: ft²/person divides,
    // W/ft² multiplies. Swapping them is a 116x error that still looks like a
    // number, so pin the direction rather than the magnitude.
    expect(OFFICE_PRESET.areaPerPerson.value!).toBeLessThan(200);
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

  it('carries all eighteen building types, each with a unique id and a label', () => {
    // Sixteen PNNL prototypes, plus Single Family and Laboratory — neither has
    // a PNNL model, so each borrows one.
    expect(GAIN_PRESETS).toHaveLength(18);
    expect(new Set(GAIN_PRESETS.map((p) => p.id)).size).toBe(18);
    for (const preset of GAIN_PRESETS) expect(preset.label.length).toBeGreaterThan(0);
  });

  it('gives Laboratory hospital equipment on an office schedule', () => {
    // A lab has hospital-like benches and plant but keeps business hours, so
    // the two halves come from different prototypes on purpose.
    const lab = presetById('laboratory')!;
    const hospital = presetById('hospital')!;
    const office = presetById('office-medium')!;
    expect(lab.miscEquipment.value).toBeCloseTo(hospital.miscEquipment.value!, 9);
    expect(lab.areaPerPerson.value).toBeCloseTo(hospital.areaPerPerson.value!, 9);
    expect(lab.schedules.occupancy.values).toEqual(office.schedules.occupancy.values);
    // And NOT the hospital's, which never empties overnight.
    expect(hospital.schedules.occupancy.values[3]!).toBeGreaterThan(0);
    expect(lab.schedules.occupancy.values[3]).toBe(0);
  });

  it('names a massing that exists for every type', () => {
    const drawn = new Set(BUILDING_TYPES.map((t) => t.id));
    for (const preset of GAIN_PRESETS) {
      expect(drawn.has(preset.massing), `${preset.id} -> ${preset.massing}`).toBe(true);
    }
    // Every drawing earns its place: none is orphaned.
    for (const id of drawn) {
      expect(GAIN_PRESETS.some((p) => p.massing === id), `nothing uses the ${id} massing`).toBe(true);
    }
  });

  it('gives Single Family the Mid-rise Apartment numbers, as instructed', () => {
    const single = presetById('residential-single')!;
    const mid = presetById('apartment-midrise')!;
    expect(single.areaPerPerson.value).toBeCloseTo(mid.areaPerPerson.value!, 9);
    expect(single.miscEquipment.value).toBeCloseTo(mid.miscEquipment.value!, 9);
    expect(single.schedules.occupancy.values).toEqual(mid.schedules.occupancy.values);
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

  it('replaces the schedules too — the half that matters most', () => {
    // A picker that changed only the densities would be the wrong half: the
    // verdict lands between 04:00 and 07:00, where the schedule decides.
    const next = applyGainPreset(DEFAULT_GAINS, warehouse);
    expect(next.schedules.occupancy.fractions).toEqual(warehouse.schedules.occupancy.values);
    expect(next.schedules.lighting.fractions).toEqual(warehouse.schedules.lighting.values);
    expect(next.schedules.miscEquipment.fractions).toEqual(warehouse.schedules.miscEquipment.values);
    // Still a preset, not a custom strip — the badge survives.
    expect(next.schedules.occupancy.source).toBe('preset');
  });

  it('gives an apartment a nearly-full night and an office an empty one', () => {
    // The single clearest reason the schedules had to come across. At 05:00 on
    // the design day an apartment is occupied and an office is not.
    const apartment = presetById('apartment-midrise')!;
    const office = presetById('office-medium')!;
    expect(apartment.schedules.occupancy.values[5]!).toBeGreaterThan(0.9);
    expect(office.schedules.occupancy.values[5]!).toBe(0);
  });

  it('keeps every schedule 24 long and inside 0-1', () => {
    for (const preset of GAIN_PRESETS) {
      for (const key of ['occupancy', 'lighting', 'miscEquipment', 'itEquipment'] as const) {
        const values = preset.schedules[key].values;
        expect(values, `${preset.id}.${key}`).toHaveLength(24);
        for (const v of values) {
          expect(v, `${preset.id}.${key}`).toBeGreaterThanOrEqual(0);
          expect(v, `${preset.id}.${key}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('runs IT flat in every building', () => {
    for (const preset of GAIN_PRESETS) {
      expect(preset.schedules.itEquipment.values.every((v) => v === 1), preset.id).toBe(true);
    }
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
    // A restaurant dining room is 14 ft²/person against a warehouse's 466. If
    // the picker were wired to nothing these two would come back identical,
    // which is the failure this test exists to catch.
    expect(solveWith('restaurant-full').balancePoint.onMeanGain)
      .toBeLessThan(solveWith('warehouse').balancePoint.onMeanGain);
  });

  it('gives eighteen distinct answers, not one repeated eighteen times', () => {
    const points = GAIN_PRESETS.map((p) => solveWith(p.id).balancePoint.onMeanGain.toFixed(3));
    // Single Family and Mid-rise Apartment are the same building by
    // instruction, so sixteen distinct answers is the ceiling.
    expect(new Set(points).size).toBeGreaterThan(13);
  });

  it('leaves the envelope alone — this picker moves gains only', () => {
    const before = solveWith('office-medium');
    const after = solveWith('warehouse');
    expect(after.hours[0]!.loss).toBeCloseTo(before.hours[0]!.loss, 9);
    expect(after.hours[0]!.gain).not.toBeCloseTo(before.hours[0]!.gain, 3);
  });
});

