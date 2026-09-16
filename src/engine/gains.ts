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
/** The IT load in watts, whatever happens to it afterwards. */
function itWatts(gains: Gains): number {
  return gains.itEquipment.kilowatts * 1000;
}

/**
 * The cooling COP assumed for a heat recovery chiller.
 *
 * A chiller rejects condenser heat equal to what it absorbed PLUS the work the
 * compressor did to move it, so the heating it delivers is larger than the load
 * it cooled. At a cooling COP of 3.5 — mid-range for a water-cooled machine
 * making useful hot water, and deliberately not the best case — that is
 * 1 + 1/3.5 = 1.29 kW of heating per kW of IT.
 *
 * Fixed and disclosed rather than exposed. It is the kind of number the tool
 * can default correctly at screening stage, where the question is whether the
 * strategy is worth pursuing rather than what machine to buy.
 */
export const RECOVERY_COP = 3.5;

/** Heating delivered per unit of heat recovered. 1.29 at COP 3.5. */
export const RECOVERY_MULTIPLIER = 1 + 1 / RECOVERY_COP;

/**
 * Heating hot water available from recovery, at full IT load.
 *
 * Zero unless the IT is on chilled water: air-cooled heat is already counted as
 * a passive gain, and rejected heat is gone. Follows the IT schedule, which is
 * flat by definition — the recovery is available exactly when the IT runs, and
 * IT runs through the night, which is when the building needs it.
 */
export function recoveryTerm(gains: Gains): GainTerm {
  return {
    slot: 'gain-it-equipment',
    label: 'Recovered from cooling',
    peakWatts:
      gains.itEquipment.cooling === 'chilled-water' ? itWatts(gains) * RECOVERY_MULTIPLIER : 0,
    schedule: gains.schedules.itEquipment.fractions,
  };
}

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
      //
      // Only AIR-cooled IT is a gain to this space. Chilled-water IT is worth
      // something, but not here and not passively — see `recoveryTerm`. A
      // zero-watt term draws no arrow and adds nothing, which is exactly right:
      // a CHW-cooled hall does not warm the room it sits in.
      peakWatts: gains.itEquipment.cooling === 'air' ? itWatts(gains) : 0,
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
