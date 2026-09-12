/**
 * The 24-hour balance, the verdict, and the headline metrics.
 *
 * Sign convention throughout: **loss positive outward, gain positive inward,
 * net is gain minus loss.** A positive net means the space is self-heating that
 * hour.
 *
 * `solve` reduces a list of labelled TERMS rather than a single UA and a single
 * gain. Everything downstream — verdict, chart, export — consumes the result of
 * that reduction, so v2's ventilation term and v3's solar term each append one
 * entry and nothing else changes.
 */

import type { Conditions, Envelope, Gains, DesignDay, SurfaceSlot } from '../model/types';
import { conductance, groundLoss, wallToFloorRatio } from './ua';
import { gainTerms, gainAtHour, termAtHour } from './gains';

/** The Passive House peak heating load benchmark, W/m². A rough reference. */
export const PASSIVE_HOUSE_BENCHMARK_W_M2 = 10;

export interface TermResult {
  readonly slot: SurfaceSlot;
  readonly label: string;
  /** W in this hour. Positive is a magnitude, not a direction. */
  readonly watts: number;
}

export interface HourResult {
  readonly hour: number;
  /** °C */
  readonly outdoorTemperature: number;
  readonly lossTerms: readonly TermResult[];
  readonly gainTerms: readonly TermResult[];
  /** W */
  readonly loss: number;
  readonly gain: number;
  /** gain − loss. Negative means heating is needed this hour. */
  readonly net: number;
}

export interface BalancePoint {
  /** °C, on the 24-hour mean gain. The headline. */
  readonly onMeanGain: number;
  /** °C, at the occupied peak. */
  readonly atPeakGain: number;
  /** °C, at the overnight minimum. */
  readonly atMinGain: number;
}

export interface Lever {
  readonly slot: SurfaceSlot;
  readonly label: string;
  /** 0–1, this term's share of the worst hour's total loss. */
  readonly share: number;
}

export interface BalanceResult {
  readonly hours: readonly HourResult[];
  readonly conductance: { readonly air: number; readonly ground: number; readonly total: number };
  /** W */
  readonly peakGain: number;
  readonly meanGain: number;
  readonly minGain: number;
  readonly balancePoint: BalancePoint;
  readonly deficitHours: number;
  /** W, and W/m². Zero when the building never needs heating. */
  readonly peakHeatingLoad: number;
  readonly peakHeatingLoadPerArea: number;
  /** The hour the verdict is decided on — the worst NET hour, not the coldest. */
  readonly worstHour: number;
  readonly selfHeating: boolean;
  /** Worst hour's net over floor area, W/m². Negative when short. */
  readonly marginPerArea: number;
  /** The largest single loss term at the worst hour, or null if there is none. */
  readonly lever: Lever | null;
  readonly wallToFloorRatio: number;
}

/**
 * Balance-point temperature.
 *
 *   T_bal = T_in − ( Q̄_gain − Q_ground ) / UA_air
 *
 * The ground-coupled loss is subtracted because it does not vary with outdoor
 * air; leaving it in would attribute a constant loss to the air-side
 * conductance and drag the balance point down by a fixed amount that has
 * nothing to do with the weather.
 *
 * Reported three ways because a scheduled building does not have one. In the
 * worked example the same building returns +3.8 °C on mean gain, +16.2 °C
 * overnight and −12.2 °C at occupied peak — one number would be a lie of
 * omission, and the spread IS the insight: self-heating at lunchtime, nowhere
 * near it at 04:00.
 */
function balancePointFor(
  gainWatts: number,
  groundWatts: number,
  airConductance: number,
  setpoint: number,
): number {
  if (airConductance <= 0) return Number.NEGATIVE_INFINITY;
  return setpoint - (gainWatts - groundWatts) / airConductance;
}

export interface SolveInput {
  readonly envelope: Envelope;
  readonly gains: Gains;
  readonly conditions: Conditions;
  readonly designDay: DesignDay;
}

export function solve(input: SolveInput): BalanceResult {
  const { envelope, gains, conditions, designDay } = input;
  const ua = conductance(envelope);
  const ground = groundLoss(envelope, conditions);
  const terms = gainTerms(gains, envelope.floorArea);
  const area = envelope.floorArea;

  const hours: HourResult[] = designDay.hours.map((designHour) => {
    const dtAir = conditions.indoorSetpoint - designHour.tdb;

    const lossResults: TermResult[] = ua.terms.map((term) => ({
      slot: term.slot,
      label: term.label,
      watts:
        term.driver === 'ground'
          ? term.conductance * (conditions.indoorSetpoint - conditions.groundTemperature)
          : term.conductance * dtAir,
    }));

    const gainResults: TermResult[] = terms.map((term) => ({
      slot: term.slot,
      label: term.label,
      watts: termAtHour(term, designHour.hour),
    }));

    const loss = ua.air * dtAir + ground;
    const gain = gainAtHour(terms, designHour.hour);

    return {
      hour: designHour.hour,
      outdoorTemperature: designHour.tdb,
      lossTerms: lossResults,
      gainTerms: gainResults,
      loss,
      gain,
      net: gain - loss,
    };
  });

  const gainValues = hours.map((h) => h.gain);
  const peakGain = Math.max(...gainValues);
  const minGain = Math.min(...gainValues);
  const meanGain = gainValues.reduce((a, b) => a + b, 0) / gainValues.length;

  // The WORST hour is the worst NET hour, which is not the coldest hour. Loss
  // peaks with the temperature minimum, but the verdict usually lands an hour
  // earlier — before the occupancy schedule starts. That gap is the single most
  // useful thing this tool surfaces.
  const worst = hours.reduce((a, h) => (h.net < a.net ? h : a), hours[0]!);

  const peakHeatingLoad = Math.max(0, -worst.net);
  const deficitHours = hours.filter((h) => h.net < 0).length;

  // The lever: the largest loss term at the worst hour, as a share of that
  // hour's total loss. Measured there rather than over conductance because the
  // worst hour is where the gap actually is, and because it accounts for the
  // ground term correctly — the ground floor is envelope, and a conductance
  // share that quietly drops it would overstate every other row.
  const worstTerms = [...worst.lossTerms].sort((a, b) => b.watts - a.watts);
  const biggest = worstTerms[0];
  const lever: Lever | null =
    biggest && worst.loss > 0 && biggest.watts > 0
      ? { slot: biggest.slot, label: biggest.label, share: biggest.watts / worst.loss }
      : null;

  return {
    hours,
    conductance: { air: ua.air, ground: ua.ground, total: ua.total },
    peakGain,
    meanGain,
    minGain,
    balancePoint: {
      onMeanGain: balancePointFor(meanGain, ground, ua.air, conditions.indoorSetpoint),
      atPeakGain: balancePointFor(peakGain, ground, ua.air, conditions.indoorSetpoint),
      atMinGain: balancePointFor(minGain, ground, ua.air, conditions.indoorSetpoint),
    },
    deficitHours,
    peakHeatingLoad,
    peakHeatingLoadPerArea: area > 0 ? peakHeatingLoad / area : 0,
    worstHour: worst.hour,
    selfHeating: deficitHours === 0,
    marginPerArea: area > 0 ? worst.net / area : 0,
    lever,
    wallToFloorRatio: wallToFloorRatio(envelope),
  };
}
