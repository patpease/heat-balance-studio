/**
 * Preset 24-hour schedules.
 *
 * Fractions of the density in `defaults.ts`, hour 0 being 00:00–01:00 local
 * standard time.
 *
 * **The overnight floor is the load-bearing part of every one of these.** This
 * tool's verdict is decided between 04:00 and 07:00 — the coldest hours, before
 * occupancy starts — so a lighting or equipment row that drops to zero at night
 * flatters every building the tool will ever see. Presets ship with a realistic
 * standby fraction and the UI shows it.
 *
 * IT is the exception and is flat by definition. A server room does not care
 * what time it is, and that is the entire reason it was split out from misc
 * equipment: a watt of 24/7 load is worth roughly three times a watt of
 * scheduled load to this answer.
 *
 * SOURCING: these profiles are placeholders pending the schedule data Patrick
 * is collecting. They are shaped correctly but are not yet traceable to a
 * published table, which is why `preset` is named "Office (provisional)" rather
 * than after a standard. A number badged with a standard's name must be cited.
 */

import type { Schedule } from './types';

function schedule(id: string, name: string, fractions: number[]): Schedule {
  if (fractions.length !== 24) {
    throw new RangeError(`${id}: a schedule needs exactly 24 fractions, got ${fractions.length}`);
  }
  for (const f of fractions) {
    if (!Number.isFinite(f) || f < 0 || f > 1) {
      throw new RangeError(`${id}: schedule fractions must be 0–1, got ${f}`);
    }
  }
  return { id, name, source: 'preset', fractions: Object.freeze(fractions) };
}

/** Flat at full load, every hour. The IT default. */
export const ALWAYS_ON = schedule(
  'always-on',
  'Continuous, 24/7',
  new Array(24).fill(1),
);

export const OFFICE_OCCUPANCY = schedule(
  'office-occupancy',
  'Office, 9–5',
  [0, 0, 0, 0, 0, 0, 0, 0.10, 0.50, 0.95, 0.95, 0.95,
   0.50, 0.95, 0.95, 0.95, 0.95, 0.50, 0.10, 0.05, 0, 0, 0, 0],
);

export const OFFICE_LIGHTING = schedule(
  'office-lighting',
  'Office lighting',
  [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.30, 0.90, 0.90, 0.90, 0.90,
   0.90, 0.90, 0.90, 0.90, 0.90, 0.90, 0.50, 0.30, 0.05, 0.05, 0.05, 0.05],
);

export const OFFICE_MISC_EQUIPMENT = schedule(
  'office-misc-equipment',
  'Office equipment',
  [0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.60, 0.90, 0.90, 0.90, 0.90,
   0.90, 0.90, 0.90, 0.90, 0.90, 0.90, 0.60, 0.45, 0.35, 0.35, 0.35, 0.35],
);

export const SCHEDULE_PRESETS: readonly Schedule[] = Object.freeze([
  OFFICE_OCCUPANCY,
  OFFICE_LIGHTING,
  OFFICE_MISC_EQUIPMENT,
  ALWAYS_ON,
]);

/** A custom schedule built from 24 user-dragged bars. */
export function customSchedule(fractions: number[]): Schedule {
  const s = schedule('custom', 'Custom', fractions);
  return { ...s, source: 'custom' };
}
