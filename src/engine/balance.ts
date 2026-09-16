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
import { gainTerms, gainAtHour, recoveryTerm, termAtHour } from './gains';


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
  /**
   * W of heating hot water a recovery chiller could deliver this hour.
   *
   * NOT part of `gain` and NOT part of `net`. This is heat the building can
   * have if it runs a machine, and the whole point of keeping it separate is
   * that "self-heating" has to keep meaning what it means.
   */
  readonly recoverable: number;
}

export interface BalancePoint {
  /** °C, on the 24-hour mean gain. The headline. */
  readonly onMeanGain: number;
  /** °C, at the occupied peak. */
  readonly atPeakGain: number;
  /** °C, at the overnight minimum. */
  readonly atMinGain: number;
}

/**
 * Three answers, not two.
 *
 * `self-heating`     the passive gains cover the losses, every hour. The
 *                    building needs no heating plant at all on this design day.
 * `recovered`        the passive gains do not, but a heat recovery chiller on
 *                    the IT cooling loop closes the gap. Not passive — the
 *                    building is running machinery — but the heat is a
 *                    by-product of cooling it had to do anyway, which is about
 *                    as efficient as heating gets.
 * `partly-recovered` recovery is real and does not close the day. The common
 *                    case: a 4 kW comms closet on chilled water against a
 *                    58 kW gap. Reporting it as plain `short` throws away the
 *                    part that IS covered, and reporting it as `recovered`
 *                    would be a claim the building cannot meet.
 * `short`            nothing recoverable, or recovery worth nothing.
 *
 * The two middle states exist because the binary hid them. A data hall on
 * chilled water used to read as self-heating, which was wrong, or as short,
 * which was unfair: the honest answer is that the heat is there and it takes a
 * machine to move it.
 */
export type BalanceStatus = 'self-heating' | 'recovered' | 'partly-recovered' | 'short';

/** What recovery is worth, when there is any to be had. */
export interface Recovery {
  /** W available at the worst passive hour. */
  readonly availableAtWorstHour: number;
  /** W of it actually needed to close that hour. */
  readonly usedAtWorstHour: number;
  /** The most any hour draws. Sizes the machine. */
  readonly peakUsed: number;
  /** Hours that would be short passively and are not, once recovery is counted. */
  readonly hoursCovered: number;
  /** Hours still short once recovery is counted. */
  readonly hoursStillShort: number;
  /** The worst hour AFTER recovery, which need not be the worst passive one. */
  readonly worstHour: number;
  /** W/m² at that hour. Negative means still short. */
  readonly marginPerArea: number;
  /** W still missing at that hour, 0 when recovery closes the day. */
  readonly stillShort: number;
  /** W/m² still missing at that hour. */
  readonly stillShortPerArea: number;
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
  /** PASSIVE self-heating. Unchanged meaning: recovery is not counted here. */
  readonly selfHeating: boolean;
  /** The three-state answer. `selfHeating` is `status === 'self-heating'`. */
  readonly status: BalanceStatus;
  /** Null when nothing is recoverable — an air-cooled or rejected IT load. */
  readonly recovery: Recovery | null;
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

/**
 * The design day as the analysis will use it.
 *
 * Flattening replaces all 24 hours with the minimum, which is what the ASHRAE
 * heating design day is by convention. Everything downstream reads the result
 * of this, so the chart's outdoor-air line goes flat too — which is the point:
 * a user comparing against a load calculation should SEE that the swing is gone
 * rather than take it on trust.
 */
function profileFor(designDay: DesignDay, conditions: Conditions): DesignDay {
  if (!conditions.flatDesignDay) return designDay;
  return {
    ...designDay,
    dailyRange: 0,
    hours: designDay.hours.map((h) => ({ ...h, tdb: designDay.minimum })),
  };
}

export function solve(input: SolveInput): BalanceResult {
  const { envelope, gains, conditions } = input;
  const designDay = profileFor(input.designDay, conditions);
  const ua = conductance(envelope);
  const ground = groundLoss(envelope, conditions);
  const terms = gainTerms(gains, envelope.floorArea);
  const recovery = recoveryTerm(gains);
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
      recoverable: termAtHour(recovery, designHour.hour),
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
  // Recovery is judged on the same hours the verdict is: a strategy that closes
  // 23 hours and leaves one open has not closed the day.
  const anyRecoverable = hours.some((h) => h.recoverable > 0);
  const shortAfterRecovery = hours.filter((h) => h.net + h.recoverable < 0).length;
  // The worst hour once recovery is counted, which is not always the worst
  // passive hour: recovery is flat and the passive gains are not, so the hour
  // that hurts most can move.
  const worstAfter = hours.reduce(
    (a, h) => (h.net + h.recoverable < a.net + a.recoverable ? h : a),
    hours[0]!,
  );
  const status: BalanceStatus =
    deficitHours === 0
      ? 'self-heating'
      : shortAfterRecovery === 0
        ? 'recovered'
        : anyRecoverable
          ? 'partly-recovered'
          : 'short';

  const recoveryResult: Recovery | null = anyRecoverable
    ? {
        availableAtWorstHour: worst.recoverable,
        // Only what the hour actually needs. A 514 kW machine covering a 60 kW
        // gap has not "delivered 514 kW" — it has delivered 60 and could do
        // more, and reporting the capacity as though it were the duty is how a
        // screening number becomes a plant size nobody can justify.
        usedAtWorstHour: Math.min(worst.recoverable, Math.max(0, -worst.net)),
        peakUsed: Math.max(
          0,
          ...hours.map((h) => Math.min(h.recoverable, Math.max(0, -h.net))),
        ),
        hoursCovered: hours.filter((h) => h.net < 0 && h.net + h.recoverable >= 0).length,
        hoursStillShort: shortAfterRecovery,
        worstHour: worstAfter.hour,
        marginPerArea: area > 0 ? (worstAfter.net + worstAfter.recoverable) / area : 0,
        stillShort: Math.max(0, -(worstAfter.net + worstAfter.recoverable)),
        stillShortPerArea:
          area > 0 ? Math.max(0, -(worstAfter.net + worstAfter.recoverable)) / area : 0,
      }
    : null;

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
    status,
    recovery: recoveryResult,
    marginPerArea: area > 0 ? worst.net / area : 0,
    lever,
    wallToFloorRatio: wallToFloorRatio(envelope),
  };
}
