/**
 * EPW parsing, trimmed to what this tool needs.
 *
 * Lifted from `psychrometric-studio/web/src/weather/epw.ts` — ours, MIT — and
 * cut down hard. That tool reads dry bulb, relative humidity and station
 * pressure so it can compute a humidity ratio per hour; this one is sensible-
 * heat only and needs **dry bulb alone**. The PsychroLib dependency and the
 * altitude handling go with it.
 *
 * What does NOT get cut is the sentinel handling. EPW marks a missing
 * temperature with `99.9`, which is a **value, not a blank**: a 99.9 °C hour
 * read as real would sit at the top of any percentile and drag the design
 * minimum with it. Rows carrying it are dropped and counted.
 *
 * Nothing is uploaded. The file is read in the browser and never leaves the
 * machine, which is the same promise the rest of the tool makes.
 */

import type { HourSample } from './designDay';

/** Eight header lines, then 8,760 hourly records. */
const HEADER_LINES = 8;

/** Zero-based column indices in a data row. */
const FIELD = {
  year: 0,
  month: 1,
  day: 2,
  hour: 3,
  dryBulb: 6,
} as const;

/** EPW's missing-data sentinel for dry-bulb temperature. */
const MISSING_TEMPERATURE = 99.9;

export interface EpwLocation {
  readonly city: string;
  readonly state: string;
  readonly country: string;
  readonly wmo: string;
  readonly latitude: number;
  readonly longitude: number;
  /** Hours ahead of UTC, as the file states it. */
  readonly timeZone: number;
  /** Metres. */
  readonly elevation: number;
}

export interface EpwFile {
  readonly location: EpwLocation;
  readonly samples: readonly HourSample[];
  /** Rows that could not be read, with the reason. Empty for a clean file. */
  readonly problems: readonly string[];
  readonly droppedRows: number;
}

const EMPTY_LOCATION: EpwLocation = {
  city: '',
  state: '',
  country: '',
  wmo: '',
  latitude: 0,
  longitude: 0,
  timeZone: 0,
  elevation: 0,
};

function parseLocation(line: string): EpwLocation {
  const parts = line.split(',');
  const number = (index: number): number => {
    const value = Number.parseFloat(parts[index] ?? '');
    return Number.isFinite(value) ? value : 0;
  };
  return {
    city: (parts[1] ?? '').trim(),
    state: (parts[2] ?? '').trim(),
    country: (parts[3] ?? '').trim(),
    wmo: (parts[5] ?? '').trim(),
    latitude: number(6),
    longitude: number(7),
    timeZone: number(8),
    elevation: number(9),
  };
}

export function describeLocation(location: EpwLocation): string {
  return [location.city, location.state, location.country].filter(Boolean).join(', ') || 'Unnamed location';
}

/**
 * Parse EPW text into hourly samples.
 *
 * An EPW is already in local standard time — it has no daylight saving and no
 * 23- or 25-hour days — so unlike the Open-Meteo path there is no clock to
 * correct here. That is worth saying out loud, because the archive path spent a
 * whole phase on exactly that problem.
 *
 * EPW numbers hours 1–24, where hour 24 is the hour *ending* at midnight. The
 * derivation wants 0–23, so 24 maps to 23 rather than rolling into the next
 * day: a design day is built from a day's shape, and moving one hour across a
 * date boundary would make two days incomplete instead of one complete.
 */
export function parseEpw(text: string): EpwFile {
  const lines = text.split(/\r?\n/);

  if (lines.length < HEADER_LINES + 1 || !(lines[0] ?? '').startsWith('LOCATION')) {
    return {
      location: EMPTY_LOCATION,
      samples: [],
      droppedRows: 0,
      problems: [
        'This does not look like an EPW file — the first line should begin with "LOCATION". ' +
          'If you have a .zip from Climate.OneBuilding, drop the whole .zip in; it will be opened for you.',
      ],
    };
  }

  const location = parseLocation(lines[0]!);
  const samples: HourSample[] = [];
  const problems: string[] = [];
  let missing = 0;
  let malformed = 0;

  for (let index = HEADER_LINES; index < lines.length; index++) {
    const line = lines[index];
    if (!line || line.trim() === '') continue;

    const parts = line.split(',');
    if (parts.length < 7) {
      malformed++;
      continue;
    }

    const tdb = Number.parseFloat(parts[FIELD.dryBulb] ?? '');
    const month = Number.parseInt(parts[FIELD.month] ?? '', 10);
    const day = Number.parseInt(parts[FIELD.day] ?? '', 10);
    const hour = Number.parseInt(parts[FIELD.hour] ?? '', 10);

    if (!Number.isFinite(tdb) || !Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(hour)) {
      malformed++;
      continue;
    }
    // The sentinel is a value, not a blank.
    if (tdb >= MISSING_TEMPERATURE) {
      missing++;
      continue;
    }

    samples.push({
      dayKey: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      month,
      hour: Math.min(23, Math.max(0, hour - 1)),
      tdb,
    });
  }

  if (missing > 0) problems.push(`${missing} hours carried EPW's missing-data marker and were dropped.`);
  if (malformed > 0) problems.push(`${malformed} rows could not be read and were dropped.`);
  if (samples.length === 0) problems.push('No usable hourly temperatures were found in this file.');

  return { location, samples, problems, droppedRows: missing + malformed };
}
