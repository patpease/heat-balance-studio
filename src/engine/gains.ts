/**
 * Internal heat gain, hour by hour.
 *
 *   Q_gain(h) = f_occ(h)·N·q_p
 *             + f_lgt(h)·LPD·A
 *             + f_misc(h)·MPD·A
 *             + f_IT(h)·IPD·φ·A
 *
 * All of it sensible. This tool has no latent side, so `sensiblePerPerson` is
 * the *sensible* half of a person's output and not their total — roughly 75 W
 * of a ~120 W total for seated office work. Using the total would overstate
 * every gain by about 60%.
 *
 * Lighting and misc-equipment power is taken as sensible heat released into the
 * space in the hour it is drawn. That is exact for lighting and for most plug
 * loads; it is wrong for anything that exhausts its heat directly (a fume hood,
 * a vented appliance) or stores it, and it is optimistic in both cases. IT
 * power carries φ for the same reason, made explicit because a separately-cooled
 * server room is a common case rather than an edge one.
 */

import type { Gains, SurfaceSlot } from '../model/types';

export interface GainTerm {
  readonly slot: SurfaceSlot;
  readonly label: string;
  /** Full-load watts, before the hour's schedule fraction. */
  readonly peakWatts: number;
  /** Exactly 24 fractions, 0–1. */
  readonly schedule: readonly number[];
}

/** Occupants, from either a density or a headcount. */
export function occupantCount(gains: Gains, floorArea: number): number {
  if (gains.occupancy.mode === 'count') return gains.occupancy.count;
  const perPerson = gains.occupancy.areaPerPerson;
  if (!Number.isFinite(perPerson) || perPerson <= 0) return 0;
  return floorArea / perPerson;
}

/**
 * The four gain terms at full load, each with its own schedule.
 *
 * IT is separate from misc equipment because the two behave differently at the
 * hour that decides the answer. IT runs flat through the night; misc drops to a
 * standby floor. In the worked example, re-reading a blended 8.0 W/m² as
 * 7.0 misc + 1.0 IT leaves peak gain essentially unchanged but lifts the night
 * floor from 3.1 to 3.8 W/m² — a watt of 24/7 load is worth roughly three times
 * a watt of scheduled load to this verdict.
 */
export function gainTerms(gains: Gains, floorArea: number): GainTerm[] {
  const people = occupantCount(gains, floorArea);
  return [
    {
      slot: 'gain-people',
      label: 'People',
      peakWatts: people * gains.occupancy.sensiblePerPerson,
      schedule: gains.schedules.occupancy.fractions,
    },
    {
      slot: 'gain-lighting',
      label: 'Lighting',
      peakWatts: gains.lighting.powerDensity * floorArea,
      schedule: gains.schedules.lighting.fractions,
    },
    {
      slot: 'gain-misc-equipment',
      label: 'Misc equipment',
      peakWatts: gains.miscEquipment.powerDensity * floorArea,
      schedule: gains.schedules.miscEquipment.fractions,
    },
    {
      slot: 'gain-it-equipment',
      label: 'IT equipment',
      // No floorArea. This is the one gain that does not scale with the
      // building — see the note on Gains.itEquipment. kW to W is the only
      // conversion it needs, and it is the same in IP and SI.
      peakWatts: gains.itEquipment.kilowatts * 1000 * gains.itEquipment.spaceFraction,
      schedule: gains.schedules.itEquipment.fractions,
    },
  ];
}

/** One term's contribution in one hour, W. */
export function termAtHour(term: GainTerm, hour: number): number {
  return term.peakWatts * (term.schedule[hour] ?? 0);
}

/** Total internal gain in one hour, W. */
export function gainAtHour(terms: readonly GainTerm[], hour: number): number {
  return terms.reduce((sum, term) => sum + termAtHour(term, hour), 0);
}
