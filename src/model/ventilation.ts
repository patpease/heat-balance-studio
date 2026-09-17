/**
 * Mechanical ventilation, and the heat recovery on it.
 *
 * The last of the two omissions the assumption list called the largest, and
 * the one that finally lets the verdict stop being labelled optimistic.
 *
 * ## Why it is entered like a gain and counted like a loss
 *
 * Infiltration is uncontrolled: a leakage grade over an envelope area, and
 * nothing can be recovered from it. Ventilation is designed. It has a rate
 * somebody specified, it follows a schedule somebody chose, and the heat in the
 * air leaving can be handed back to the air coming in. So the input looks like
 * the internal gains — a per-person rate, a per-area rate, and a schedule —
 * even though the term it produces is a loss.
 *
 * ## The rate
 *
 * ASHRAE 62.1's Ventilation Rate Procedure sizes a zone as
 * `Rp × people + Ra × area`: the per-person part is for the occupants, the
 * per-area part for the space itself — carpets, furniture, finishes — and a
 * space with nobody in it still needs the second. Both halves are here for that
 * reason, and the defaults are 62.1's office values.
 *
 * What is NOT here: zone air distribution effectiveness, system-level
 * multi-zone efficiency, and the critical-zone calculation. Those belong to a
 * system that has been laid out, and at concept stage there is no system.
 */

import type { Schedule } from './types';

/** 1 cfm = 4.71947 × 10⁻⁴ m³/s. */
export const CUBIC_METRES_PER_SECOND_PER_CFM = 0.0283168466 / 60;
export const SQUARE_METRES_PER_SQUARE_FOOT = 0.09290304;

/**
 * ASHRAE 62.1 office: 5 cfm/person and 0.06 cfm/ft².
 *
 * The most-quoted line in the table and a reasonable place for any building to
 * start. Both stored canonical: m³/s per person, m³/s per m².
 */
export const DEFAULT_PER_PERSON = 5 * CUBIC_METRES_PER_SECOND_PER_CFM;
export const DEFAULT_PER_AREA = (0.06 * CUBIC_METRES_PER_SECOND_PER_CFM) / SQUARE_METRES_PER_SQUARE_FOOT;

/**
 * When the fan runs.
 *
 * `constant` is a system that ventilates around the clock. `occupancy` follows
 * the people, which is what demand control does and what a system scheduled to
 * occupied hours approximates.
 *
 * On a heating design day the choice is worth more than it looks: the verdict
 * lands between 04:00 and 07:00, when a constant system is pulling full outdoor
 * air at the coldest hour of the day and an occupancy-following one is pulling
 * almost none.
 */
export type VentilationSchedule = 'constant' | 'occupancy';

/**
 * Air-side heat recovery, by device.
 *
 * Effectiveness ranges are the rule-of-thumb figures from the IBPSA-USA BEMP
 * Training Workshop table, and each preset takes the middle of its range — a
 * screening tool has no business picking the top of a range it cannot verify.
 *
 * Devices whose middles coincide are not listed twice. The heat pipe and the
 * plate exchanger both sit at 60% of a 50–70% range, so offering both was two
 * buttons for one calculation; the heat pipe is named in the plate exchanger's
 * note instead.
 *
 * **Sensible only, which costs the enthalpy wheel its best argument.** A wheel
 * moves moisture as well as heat and its quoted effectiveness includes that;
 * this tool has no latent side, so only the sensible half is credited. The
 * wheel is still the most effective device here, and in a real building it is
 * further ahead than this shows.
 */
export type HeatRecoveryType = 'none' | 'run-around' | 'plate' | 'wheel';

export interface HeatRecoveryDevice {
  readonly id: HeatRecoveryType;
  readonly label: string;
  /** Sensible effectiveness, 0–1. The middle of the published range. */
  readonly effectiveness: number;
  readonly range: string;
  readonly note: string;
}

export const HEAT_RECOVERY: readonly HeatRecoveryDevice[] = Object.freeze([
  {
    id: 'none',
    label: 'None',
    effectiveness: 0,
    range: '—',
    note: 'Outdoor air heated from ambient. Every watt of ventilation load is paid for.',
  },
  {
    id: 'run-around',
    label: 'Run-around coil',
    effectiveness: 0.56,
    range: '45–67%',
    note: 'Two coils and a pump loop, so the airstreams never touch. Labs, hospitals, anywhere cross-contamination is the constraint.',
  },
  {
    id: 'plate',
    label: 'Plate exchanger',
    effectiveness: 0.6,
    range: '50–70%',
    note: 'A fixed plate core, no moving parts. Cleanrooms, and anywhere the two airstreams must stay separate. A heat pipe screens the same at this level of detail — the same published range, and the same middle.',
  },
  {
    id: 'wheel',
    label: 'Enthalpy wheel',
    effectiveness: 0.75,
    range: '65–85%',
    note: 'The most effective of the three, and the quoted range includes latent transfer this tool cannot count — in a real building it does better than this.',
  },
]);

export function recoveryDevice(id: HeatRecoveryType): HeatRecoveryDevice {
  return HEAT_RECOVERY.find((d) => d.id === id) ?? HEAT_RECOVERY[0]!;
}

/** Which device an effectiveness corresponds to, or null if it matches none. */
export function recoveryMatching(effectiveness: number): HeatRecoveryType | null {
  const match = HEAT_RECOVERY.find((d) => Math.abs(d.effectiveness - effectiveness) < 5e-7);
  return match ? match.id : null;
}

export interface Ventilation {
  /** m³/s per person. */
  readonly perPerson: number;
  /** m³/s per m² of floor. */
  readonly perArea: number;
  readonly schedule: VentilationSchedule;
  /** Sensible effectiveness of the heat recovery, 0–1. */
  readonly effectiveness: number;
  /** The device it came from, or null once typed over. */
  readonly recovery: HeatRecoveryType | null;
}

export const DEFAULT_VENTILATION: Ventilation = {
  perPerson: DEFAULT_PER_PERSON,
  perArea: DEFAULT_PER_AREA,
  // Constant, because it is the conservative reading and the one that shows the
  // ventilation penalty at its true size on a design day.
  schedule: 'constant',
  // No recovery by default. The tool is about the art of the possible, and
  // starting without it lets adding it be the improvement it actually is.
  effectiveness: 0,
  recovery: 'none',
};

/** The 24 fractions the fan follows. */
export function ventilationFractions(
  ventilation: Ventilation,
  occupancy: Schedule,
): readonly number[] {
  return ventilation.schedule === 'occupancy'
    ? occupancy.fractions
    : Array.from({ length: 24 }, () => 1);
}
