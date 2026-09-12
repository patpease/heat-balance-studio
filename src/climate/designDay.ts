/**
 * Deriving a cold design day from an hourly temperature record.
 *
 * **This module is pure and runs in both the browser and the Worker.** That is
 * deliberate: the Worker runs it to shrink a ~1 MB archive response to a ~1 KB
 * design day before it crosses the wire, and the browser runs the identical
 * function on a dropped EPW. One tested derivation, two sources.
 *
 * The method, and why each step is the way it is:
 *
 *  1. **Percentile over HOURS, not daily minima.** ASHRAE's 99.6% heating
 *     condition is the temperature the coldest 0.4% of annual hours fall below,
 *     so the percentile is taken over every hour in the record.
 *  2. **Cold-day window of +2 K.** Days whose minimum lands within 2 K of the
 *     design minimum. Boston gives 76 days from 3,653 — enough to average, few
 *     enough to still be cold days. Narrower and the shape gets noisy; wider and
 *     it drifts toward an ordinary winter day.
 *  3. **Shape before level.** Each cold day is normalised across its own range
 *     before averaging, so a day that happened to be 3 K colder throughout does
 *     not dominate the shape.
 *  4. **Median daily range, not mean.** Cold-day ranges are right-skewed by the
 *     occasional clear calm day.
 *  5. **Anchor at the minimum.** The reconstructed profile's lowest hour equals
 *     the design minimum exactly, so the coldest hour of the design day is the
 *     recognised design condition and not an artefact of averaging.
 *
 * The result is labelled `era5-percentile`, never "ASHRAE 99.6%". Against the
 * published station value for Boston it runs about 1.7 K colder — reanalysis
 * grid cell, ten-year window, and not the airport. That is a property of the
 * method, not a defect, and the tool says what it is rather than apologising.
 */

import type { DesignDay, DesignHour } from '../model/types';

/**
 * One hour of record, already in LOCAL STANDARD TIME.
 *
 * Getting the clock right is not a formality. Open-Meteo applies a single fixed
 * UTC offset to a whole series — the offset in force *when the request is made*,
 * not at the data's own date — so a winter series requested in summer comes back
 * labelled an hour late, and the same location would derive a different-looking
 * design day depending on the month you asked. `openMeteo.ts` converts to local
 * standard time before anything reaches here; this module trusts that and does
 * no date arithmetic of its own.
 */
export interface HourSample {
  /** Any stable per-day key. Samples sharing one are one local day. */
  readonly dayKey: string;
  /** 0–23, local standard time. */
  readonly hour: number;
  /** °C */
  readonly tdb: number;
}

export interface DeriveOptions {
  /** 0.4 for the 99.6% condition, 1.0 for 99%. */
  readonly percentile?: number;
  /** How far above the design minimum a day's own minimum may sit, K. */
  readonly coldDayWindow?: number;
  /** Days flatter than this are excluded from the SHAPE average, K. */
  readonly minimumRangeForShape?: number;
  readonly yearsOfRecord?: readonly [number, number] | null;
  readonly sourceLabel?: string;
}

const DEFAULTS = {
  percentile: 0.4,
  coldDayWindow: 2,
  minimumRangeForShape: 0.5,
} as const;

/** The value below which `fraction` percent of the sorted sample falls. */
export function percentileOf(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) throw new RangeError('percentileOf: empty series');
  const index = Math.floor((fraction / 100) * (sorted.length - 1));
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)]!;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('median: empty series');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

interface ColdDay {
  readonly hours: readonly number[];
  readonly min: number;
  readonly range: number;
}

/** Group into whole local days, discarding any day that is not 24 hours long. */
function wholeDays(samples: readonly HourSample[]): number[][] {
  const byDay = new Map<string, (number | undefined)[]>();
  for (const s of samples) {
    if (!Number.isFinite(s.tdb)) continue;
    let day = byDay.get(s.dayKey);
    if (!day) {
      day = new Array<number | undefined>(24).fill(undefined);
      byDay.set(s.dayKey, day);
    }
    day[s.hour] = s.tdb;
  }

  const out: number[][] = [];
  for (const day of byDay.values()) {
    // A partial day would distort both the minimum and the range, and a record
    // almost always has one at each end. Drop rather than interpolate.
    if (day.every((v) => v !== undefined)) out.push(day as number[]);
  }
  return out;
}

export interface Derivation {
  readonly designDay: DesignDay;
  /** What the derivation saw. Surfaced in the UI, not just for debugging. */
  readonly diagnostics: {
    readonly hoursRead: number;
    readonly wholeDays: number;
    readonly coldDaysSelected: number;
    readonly coldDaysUsedForShape: number;
  };
}

export function deriveDesignDay(
  samples: readonly HourSample[],
  options: DeriveOptions = {},
): Derivation {
  const percentile = options.percentile ?? DEFAULTS.percentile;
  const window = options.coldDayWindow ?? DEFAULTS.coldDayWindow;
  const flatLimit = options.minimumRangeForShape ?? DEFAULTS.minimumRangeForShape;

  const all = samples.map((s) => s.tdb).filter((v) => Number.isFinite(v));
  if (all.length === 0) throw new RangeError('deriveDesignDay: no usable samples');

  const sorted = [...all].sort((a, b) => a - b);
  const minimum = percentileOf(sorted, percentile);
  const annualMean = all.reduce((a, b) => a + b, 0) / all.length;

  const days = wholeDays(samples);
  const cold: ColdDay[] = [];
  for (const hours of days) {
    const min = Math.min(...hours);
    if (min <= minimum + window) {
      cold.push({ hours, min, range: Math.max(...hours) - min });
    }
  }

  // Fall back to a flat day rather than throwing. A record with no day inside
  // the window is pathological — a partial upload, say — and a flat design day
  // at the right level is still usable, where an exception is not.
  if (cold.length === 0) {
    return {
      designDay: buildDesignDay(minimum, 0, new Array(24).fill(0), annualMean, percentile, options),
      diagnostics: { hoursRead: all.length, wholeDays: days.length, coldDaysSelected: 0, coldDaysUsedForShape: 0 },
    };
  }

  const forShape = cold.filter((d) => d.range > flatLimit);
  const dailyRange = median(cold.map((d) => d.range));

  // Normalise each day to 0–1 across its OWN range before averaging, so the
  // shape is a shape and not a weighted average of levels.
  const shape = new Array(24).fill(0);
  const contributing = forShape.length > 0 ? forShape : cold;
  for (const day of contributing) {
    const span = day.range > 0 ? day.range : 1;
    for (let h = 0; h < 24; h++) shape[h] += (day.hours[h]! - day.min) / span;
  }
  for (let h = 0; h < 24; h++) shape[h] /= contributing.length;

  // Re-normalise so the averaged shape spans exactly 0–1. Averaging pulls the
  // extremes in — no single hour is the minimum on every cold day — and without
  // this the reconstructed day would be flatter than the median range claims.
  const lo = Math.min(...shape);
  const hi = Math.max(...shape);
  const span = hi - lo;
  const unit = span > 0 ? shape.map((s) => (s - lo) / span) : shape.map(() => 0);

  return {
    designDay: buildDesignDay(minimum, dailyRange, unit, annualMean, percentile, options),
    diagnostics: {
      hoursRead: all.length,
      wholeDays: days.length,
      coldDaysSelected: cold.length,
      coldDaysUsedForShape: contributing.length,
    },
  };
}

function buildDesignDay(
  minimum: number,
  dailyRange: number,
  unitShape: readonly number[],
  annualMean: number,
  percentile: number,
  options: DeriveOptions,
): DesignDay {
  const hours: DesignHour[] = unitShape.map((s, hour) => ({
    hour,
    tdb: minimum + s * dailyRange,
    ghi: null,
    dni: null,
    dhi: null,
  }));

  const years = options.yearsOfRecord ?? null;
  const source = options.sourceLabel ?? 'ERA5 via Open-Meteo';
  const span = years ? `, ${years[0]}–${years[1]}` : '';

  return {
    basis: 'era5-percentile',
    percentile,
    yearsOfRecord: years,
    minimum,
    dailyRange,
    hours,
    annualMeanTemperature: annualMean,
    // Never "ASHRAE 99.6%". The number is ours, derived, and says so.
    provenance: `${source}, coldest ${percentile}% of hours${span}`,
  };
}

/**
 * Replace a derived minimum with a published one, keeping the derived shape.
 *
 * The route for anyone holding the real ASHRAE figure, and the reason the
 * ERA5-versus-station gap does not need a bundled station table to manage. The
 * shape is the part ERA5 is good at; the level is the part a station knows
 * better.
 */
export function withMinimum(day: DesignDay, minimum: number, label: string): DesignDay {
  const shifted = day.hours.map((h) => ({
    ...h,
    tdb: minimum + (h.tdb - day.minimum),
  }));
  return { ...day, minimum, hours: shifted, basis: 'manual', provenance: label };
}
