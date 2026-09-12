/**
 * Editing internal gains.
 *
 * These live in the model rather than in the panel because the rule they
 * enforce is a correctness rule, not a UI convenience: **the source badge must
 * never outlive the number it described.** A density that came from a standard
 * and has since been typed over is no longer that standard's value, and a tool
 * that keeps the badge on it is quietly attributing the user's number to
 * ASHRAE.
 *
 * So every edit here drops `preset` to null, and the panel has no way to change
 * a value without going through one of them.
 */

import { customSchedule } from './schedules';
import type { Gains, Schedule } from './types';

export type DensityField =
  | 'areaPerPerson'
  | 'sensiblePerPerson'
  | 'count'
  | 'lighting'
  | 'miscEquipment'
  | 'itEquipment';

export type ScheduleField = keyof Gains['schedules'];

/** Drop the preset badge. Every edit path goes through this. */
function edited(gains: Gains): Gains {
  return gains.preset === null ? gains : { ...gains, preset: null };
}

export function setDensity(gains: Gains, field: DensityField, value: number): Gains {
  // A negative density is not a design decision, it is a typo. Clamp rather
  // than propagate a negative gain into the balance.
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const next = edited(gains);

  switch (field) {
    case 'areaPerPerson':
      return { ...next, occupancy: { ...next.occupancy, areaPerPerson: safe } };
    case 'sensiblePerPerson':
      return { ...next, occupancy: { ...next.occupancy, sensiblePerPerson: safe } };
    case 'count':
      return { ...next, occupancy: { ...next.occupancy, count: safe } };
    case 'lighting':
      return { ...next, lighting: { powerDensity: safe } };
    case 'miscEquipment':
      return { ...next, miscEquipment: { powerDensity: safe } };
    case 'itEquipment':
      return { ...next, itEquipment: { ...next.itEquipment, powerDensity: safe } };
  }
}

export function setOccupancyMode(gains: Gains, mode: 'density' | 'count'): Gains {
  if (gains.occupancy.mode === mode) return gains;
  // Switching the mode is not itself an edit to a value — the badge survives,
  // because nothing a standard supplied has changed.
  return { ...gains, occupancy: { ...gains.occupancy, mode } };
}

/**
 * Replace one hour of one schedule.
 *
 * The schedule becomes `custom` as well as dropping the preset: a strip the
 * user has dragged is no longer "Office, 9–5" even if 23 of its 24 hours still
 * match.
 */
export function setScheduleHour(
  gains: Gains,
  field: ScheduleField,
  hour: number,
  fraction: number,
): Gains {
  if (hour < 0 || hour > 23) return gains;
  const current = gains.schedules[field];
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  if (current.fractions[hour] === clamped) return gains;

  const fractions = [...current.fractions];
  fractions[hour] = clamped;
  const next = edited(gains);
  return {
    ...next,
    schedules: { ...next.schedules, [field]: customSchedule(fractions) },
  };
}

/** Swap a whole schedule for a preset. Also an edit — the numbers changed. */
export function setSchedule(gains: Gains, field: ScheduleField, schedule: Schedule): Gains {
  const next = edited(gains);
  return { ...next, schedules: { ...next.schedules, [field]: schedule } };
}

/**
 * The IT presets.
 *
 * Zero ships as the default because 90.1 does not separate receptacle load into
 * IT and misc, and real values span three orders of magnitude — a number that
 * looked authoritative would be wrong most of the time. A picker of recognisable
 * situations is honest in a way a single default cannot be.
 *
 * These are building-average densities: intensity of the IT room times its
 * share of the building. The figures are PROVISIONAL, pending the data being
 * collected, and the UI says so.
 */
export interface ItPreset {
  readonly id: string;
  readonly label: string;
  /** W/m² of building area. */
  readonly powerDensity: number;
  readonly note: string;
}

export const IT_PRESETS: readonly ItPreset[] = Object.freeze([
  { id: 'none', label: 'None', powerDensity: 0, note: 'No dedicated IT space.' },
  {
    id: 'idf',
    label: 'IDF closet',
    powerDensity: 1,
    note: 'A telecom or comms closet. Usually no dedicated cooling, so its heat reaches the space.',
  },
  {
    id: 'server-room',
    label: 'Server room',
    powerDensity: 4,
    note: 'Often separately cooled — some of this heat may never reach the occupied space.',
  },
  {
    id: 'data-hall',
    label: 'Data hall',
    powerDensity: 20,
    note: 'Nearly always rejects its heat outdoors. Counting it as space heat is optimistic.',
  },
]);
