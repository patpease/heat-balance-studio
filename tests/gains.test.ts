import { describe, expect, it } from 'vitest';

import { gainTerms, occupantCount, termAtHour } from '../src/engine/gains';
import { IT_PRESETS, setDensity, setOccupancyMode, setSchedule, setScheduleHour } from '../src/model/editGains';
import { DEFAULT_GAINS, OFFICE_DENSITIES, OFFICE_PRESET } from '../src/model/defaults';
import { ALWAYS_ON, OFFICE_OCCUPANCY } from '../src/model/schedules';
import { SAMPLE_GAINS } from '../src/model/sampleProject';

describe('the source badge never outlives the number it described', () => {
  it('starts as a named preset', () => {
    expect(DEFAULT_GAINS.preset).toBe(OFFICE_PRESET.label);
  });

  it('drops on any density edit', () => {
    for (const field of ['areaPerPerson', 'sensiblePerPerson', 'lighting', 'miscEquipment', 'itEquipment'] as const) {
      expect(setDensity(DEFAULT_GAINS, field, 5).preset).toBeNull();
    }
  });

  it('drops on any schedule edit', () => {
    expect(setScheduleHour(DEFAULT_GAINS, 'lighting', 3, 0.9).preset).toBeNull();
    expect(setSchedule(DEFAULT_GAINS, 'occupancy', ALWAYS_ON).preset).toBeNull();
  });

  it('marks an edited schedule as custom, not as the preset it came from', () => {
    // 23 of 24 hours still match "Office, 9–5" — it is still not that schedule.
    const edited = setScheduleHour(DEFAULT_GAINS, 'occupancy', 3, 0.5);
    expect(edited.schedules.occupancy.source).toBe('custom');
    expect(DEFAULT_GAINS.schedules.occupancy.source).toBe('preset');
  });

  it('survives a no-op edit, because nothing actually changed', () => {
    const same = setScheduleHour(DEFAULT_GAINS, 'occupancy', 0, DEFAULT_GAINS.schedules.occupancy.fractions[0]!);
    expect(same.preset).toBe(OFFICE_PRESET.label);
    expect(same).toBe(DEFAULT_GAINS);
  });

  it('survives switching how occupancy is expressed', () => {
    // Density vs headcount is a way of saying the same thing, not a new number.
    const switched = setOccupancyMode(DEFAULT_GAINS, 'count');
    expect(switched.preset).toBe(OFFICE_PRESET.label);
    expect(switched.occupancy.mode).toBe('count');
  });
});

describe('edits are clamped rather than trusted', () => {
  it('refuses a negative density', () => {
    expect(setDensity(DEFAULT_GAINS, 'lighting', -4).lighting.powerDensity).toBe(0);
  });

  it('refuses a NaN', () => {
    expect(setDensity(DEFAULT_GAINS, 'miscEquipment', Number.NaN).miscEquipment.powerDensity).toBe(0);
  });

  it('clamps a schedule fraction into 0–1', () => {
    const high = setScheduleHour(DEFAULT_GAINS, 'lighting', 5, 4);
    expect(high.schedules.lighting.fractions[5]).toBe(1);
    const low = setScheduleHour(DEFAULT_GAINS, 'lighting', 5, -2);
    expect(low.schedules.lighting.fractions[5]).toBe(0);
  });

  it('ignores an hour outside the day', () => {
    expect(setScheduleHour(DEFAULT_GAINS, 'lighting', 24, 1)).toBe(DEFAULT_GAINS);
    expect(setScheduleHour(DEFAULT_GAINS, 'lighting', -1, 1)).toBe(DEFAULT_GAINS);
  });

  it('leaves the other 23 hours alone', () => {
    const edited = setScheduleHour(DEFAULT_GAINS, 'lighting', 5, 0.5);
    DEFAULT_GAINS.schedules.lighting.fractions.forEach((f, h) => {
      if (h !== 5) expect(edited.schedules.lighting.fractions[h]).toBe(f);
    });
  });

  it('does not mutate the object it was handed', () => {
    const before = JSON.stringify(DEFAULT_GAINS);
    setDensity(DEFAULT_GAINS, 'lighting', 99);
    setScheduleHour(DEFAULT_GAINS, 'occupancy', 4, 1);
    expect(JSON.stringify(DEFAULT_GAINS)).toBe(before);
  });
});

describe('IT equipment', () => {
  it('ships at zero rather than at a plausible-looking number', () => {
    // 90.1 does not separate receptacle load, and real values span three orders
    // of magnitude. A single shipped default would look authoritative and be
    // wrong most of the time.
    expect(OFFICE_DENSITIES.itEquipment.value).toBe(0);
    expect(DEFAULT_GAINS.itEquipment.powerDensity).toBe(0);
    expect(OFFICE_DENSITIES.itEquipment.citation).not.toMatch(/ASHRAE/i);
  });

  it('defaults to the flat 24/7 strip', () => {
    expect(DEFAULT_GAINS.schedules.itEquipment).toBe(ALWAYS_ON);
    expect(DEFAULT_GAINS.schedules.itEquipment.fractions.every((f) => f === 1)).toBe(true);
  });

  it('offers presets spanning the real range, none of them cited', () => {
    expect(IT_PRESETS.map((p) => p.powerDensity)).toEqual([0, 1, 4, 20]);
    for (const preset of IT_PRESETS) {
      expect(preset.note).toBeTruthy();
      expect(preset.label).not.toMatch(/ASHRAE/i);
    }
  });

  it('holds φ at 1 with no way to change it in v1', () => {
    // The engine applies it so that exposing it later is a UI change. Nothing
    // in editGains can move it — that is the point.
    expect(DEFAULT_GAINS.itEquipment.spaceFraction).toBe(1);
    const poked = setDensity(DEFAULT_GAINS, 'itEquipment', 12);
    expect(poked.itEquipment.spaceFraction).toBe(1);
  });
});

describe('what the panel edits actually does to the balance', () => {
  it('a 24/7 watt beats a scheduled watt at the hour that decides the answer', () => {
    // The whole reason IT is its own row. Same 1 W/m², different schedule.
    const asIt = setDensity(SAMPLE_GAINS, 'itEquipment', 1);
    const asMisc = setDensity(
      { ...SAMPLE_GAINS, itEquipment: { ...SAMPLE_GAINS.itEquipment, powerDensity: 0 } },
      'miscEquipment',
      SAMPLE_GAINS.miscEquipment.powerDensity + 1,
    );

    const at6 = (g: typeof SAMPLE_GAINS) =>
      gainTerms(g, 500).reduce((sum, t) => sum + termAtHour(t, 6), 0);

    expect(at6(asIt)).toBeGreaterThan(at6(asMisc));
    // 500 W flat against 500 × 0.35 standby.
    expect(at6(asIt) - at6(asMisc)).toBeCloseTo(500 * (1 - 0.35), 0);
  });

  it('dragging the occupancy strip up at 06:00 moves the gain there', () => {
    const before = gainTerms(SAMPLE_GAINS, 500).reduce((s, t) => s + termAtHour(t, 6), 0);
    const staffed = setScheduleHour(SAMPLE_GAINS, 'occupancy', 6, 0.5);
    const after = gainTerms(staffed, 500).reduce((s, t) => s + termAtHour(t, 6), 0);
    expect(after - before).toBeCloseTo(0.5 * 27 * 75, 0);
  });

  it('switching to a headcount uses the entered number, not the density', () => {
    const counted = setDensity(setOccupancyMode(SAMPLE_GAINS, 'count'), 'count', 40);
    expect(occupantCount(counted, 500)).toBe(40);
    expect(occupantCount(SAMPLE_GAINS, 500)).toBeCloseTo(27, 6);
  });
});

describe('schedule presets', () => {
  it('are all exactly 24 hours of 0–1', () => {
    for (const schedule of [OFFICE_OCCUPANCY, ALWAYS_ON, DEFAULT_GAINS.schedules.lighting, DEFAULT_GAINS.schedules.miscEquipment]) {
      expect(schedule.fractions).toHaveLength(24);
      for (const f of schedule.fractions) {
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keep a non-zero overnight floor on lighting and equipment', () => {
    // A preset that drops to zero at night flatters every building the tool
    // will ever see, because the verdict lands between 04:00 and 07:00.
    for (const hour of [0, 3, 5, 23]) {
      expect(DEFAULT_GAINS.schedules.lighting.fractions[hour]!).toBeGreaterThan(0);
      expect(DEFAULT_GAINS.schedules.miscEquipment.fractions[hour]!).toBeGreaterThan(0);
    }
  });

  it('leave occupancy genuinely empty overnight, which is the point', () => {
    expect(DEFAULT_GAINS.schedules.occupancy.fractions[6]).toBe(0);
  });
});
