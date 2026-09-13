/**
 * A building type's four profiles, as the model's own `Schedule` records.
 *
 * This lives apart from `editGains.ts` so that `defaults.ts` can reach it
 * without importing the edit layer — defaults are data, and the edit layer
 * already depends on them.
 */

import type { GainPreset } from './gainPresets';
import { presetSchedule } from './schedules';
import type { Gains } from './types';

export function presetSchedules(preset: GainPreset): Gains['schedules'] {
  return {
    occupancy: presetSchedule(`${preset.id}-occupancy`, `${preset.label} occupancy`, preset.schedules.occupancy.values),
    lighting: presetSchedule(`${preset.id}-lighting`, `${preset.label} lighting`, preset.schedules.lighting.values),
    miscEquipment: presetSchedule(`${preset.id}-misc`, `${preset.label} equipment`, preset.schedules.miscEquipment.values),
    // IT is flat by definition and says so, whatever building it is in.
    itEquipment: presetSchedule(`${preset.id}-it`, 'Continuous, 24/7', preset.schedules.itEquipment.values),
  };
}
