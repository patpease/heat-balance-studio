/**
 * Open-Meteo: building the requests, and turning a response into samples the
 * derivation can use.
 *
 * No fetching here. This module is the judgement — URLs, validation, the clock
 * correction — and the Worker route in phase 06 is the adapter around it. That
 * split is what lets the edge run the same code the dev server does.
 *
 * Data is ERA5 via Open-Meteo, CC BY 4.0, and the attribution travels with it.
 */

import type { HourSample } from './designDay';

export const GEOCODE_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
export const ARCHIVE_ENDPOINT = 'https://archive-api.open-meteo.com/v1/archive';

/** Hosts the relay will fetch from. Exact matches, never suffixes. */
export const ALLOWED_HOSTS = Object.freeze([
  'geocoding-api.open-meteo.com',
  'archive-api.open-meteo.com',
]);

/**
 * Exact host match.
 *
 * `open-meteo.com.example.com` ends with the allowed string, so a suffix test
 * would let an attacker choose the origin our own domain fetches from. A relay
 * that fetches whatever URL it is handed is an open proxy.
 */
export function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.includes(hostname.toLowerCase());
}

/** Ten years, the settled record length. */
export const DEFAULT_YEARS = 10;

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/**
 * The STANDARD (non-DST) UTC offset for an IANA zone, in seconds.
 *
 * DST advances the clock, so the standard offset is the smaller of the
 * January/July pair. Boston: Jan −5 h, Jul −4 h → −5 h. A zone without DST
 * returns the same value twice and the minimum is that value.
 *
 * Why this exists at all: **Open-Meteo applies one fixed offset to an entire
 * series — whichever is in force when the request is made, not whichever
 * applied on the data's own date.** Ask for January 2024 in September and every
 * timestamp comes back labelled GMT−4 rather than GMT−5, so the winter profile
 * is an hour late. Verified directly: `timezone=auto` and
 * `timezone=America/New_York` both returned −14400 s for a January range
 * requested in September, and no day in ten years had 23 or 25 hours.
 *
 * Left alone, a heating design day would shift by an hour depending on the
 * month the tool happened to be used in. So archive requests ask for UTC and
 * this function supplies the offset, which depends only on the location.
 */
export function standardOffsetSeconds(timeZone: string): number {
  const offsetAt = (iso: string): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date(iso));
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
    if (!m) return 0; // "GMT" with no offset is UTC.
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60);
  };
  return Math.min(
    offsetAt('2024-01-15T12:00:00Z'),
    offsetAt('2024-07-15T12:00:00Z'),
  );
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface ArchiveRequest {
  readonly latitude: number;
  readonly longitude: number;
  readonly startDate: string;
  readonly endDate: string;
}

/**
 * Build the archive URL.
 *
 * `timezone=UTC` is load-bearing, not a default — see `standardOffsetSeconds`.
 * v3 adds `shortwave_radiation,direct_radiation,diffuse_radiation` to `hourly`
 * and nothing else about this call changes.
 */
export function archiveUrl(request: ArchiveRequest): string {
  const url = new URL(ARCHIVE_ENDPOINT);
  url.searchParams.set('latitude', request.latitude.toFixed(4));
  url.searchParams.set('longitude', request.longitude.toFixed(4));
  url.searchParams.set('start_date', request.startDate);
  url.searchParams.set('end_date', request.endDate);
  url.searchParams.set('hourly', 'temperature_2m');
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('temperature_unit', 'celsius');
  return url.toString();
}

/** US-only in v1 — one parameter, and opening it up later is a copy change. */
export function geocodeUrl(query: string, count = 5): string {
  const url = new URL(GEOCODE_ENDPOINT);
  url.searchParams.set('name', query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('country', 'US');
  return url.toString();
}

/**
 * The ten whole calendar years ending with the last complete one.
 *
 * The archive lags real time by a few days, so the current year is never
 * complete and asking for it would weight the percentile toward a partial
 * season.
 */
export function defaultDateRange(today = new Date()): { startDate: string; endDate: string; years: [number, number] } {
  const lastComplete = today.getUTCFullYear() - 1;
  const first = lastComplete - (DEFAULT_YEARS - 1);
  return {
    startDate: `${first}-01-01`,
    endDate: `${lastComplete}-12-31`,
    years: [first, lastComplete],
  };
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface ArchiveResponse {
  readonly hourly?: {
    readonly time?: unknown;
    readonly temperature_2m?: unknown;
  };
}

export class WeatherDataError extends Error {}

/**
 * A UTC archive response → samples in local standard time.
 *
 * Nulls are dropped and counted rather than interpolated: a gap in a reanalysis
 * record is rare, and inventing values to fill one would put fabricated numbers
 * into a percentile.
 */
export function samplesFromArchive(
  response: ArchiveResponse,
  offsetSeconds: number,
): { samples: HourSample[]; dropped: number } {
  const time = response.hourly?.time;
  const temps = response.hourly?.temperature_2m;

  if (!Array.isArray(time) || !Array.isArray(temps)) {
    throw new WeatherDataError('The weather service returned no hourly data.');
  }
  if (time.length !== temps.length) {
    throw new WeatherDataError('The weather service returned mismatched time and temperature series.');
  }
  if (time.length === 0) {
    throw new WeatherDataError('The weather service returned an empty series.');
  }

  const samples: HourSample[] = [];
  let dropped = 0;

  for (let i = 0; i < time.length; i++) {
    const value = temps[i];
    const stamp = time[i];
    if (typeof value !== 'number' || !Number.isFinite(value) || typeof stamp !== 'string') {
      dropped++;
      continue;
    }
    // The response is UTC; shift into local standard time before splitting the
    // day. Doing this with a Date keeps month lengths and leap years correct.
    const local = new Date(Date.parse(`${stamp}Z`) + offsetSeconds * 1000);
    if (Number.isNaN(local.getTime())) {
      dropped++;
      continue;
    }
    samples.push({
      dayKey: local.toISOString().slice(0, 10),
      month: local.getUTCMonth() + 1,
      hour: local.getUTCHours(),
      tdb: value,
    });
  }

  if (samples.length === 0) {
    throw new WeatherDataError('The weather service returned no usable temperatures.');
  }
  return { samples, dropped };
}

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

export interface GeocodeMatch {
  readonly label: string;
  readonly name: string;
  readonly admin1: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number;
  readonly timezone: string;
}

/**
 * Geocoder results, best first.
 *
 * **The caller must show the match and offer the alternatives rather than take
 * the first silently.** The geocoder is fuzzy: "Boston, Massachusetts" returns
 * Boston and then *Pittsfield*; "Springfield, Missouri" returns Springfield and
 * then *Palmyra*. The state ranks but does not filter. The first result is
 * reliably right, which is exactly what makes silent selection dangerous — it
 * would be correct almost always and wrong invisibly, and a design day derived
 * for the wrong town never announces itself.
 */
export function matchesFromGeocode(response: unknown): GeocodeMatch[] {
  const results = (response as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];

  const out: GeocodeMatch[] = [];
  for (const raw of results) {
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name : null;
    const latitude = typeof r.latitude === 'number' ? r.latitude : null;
    const longitude = typeof r.longitude === 'number' ? r.longitude : null;
    if (!name || latitude === null || longitude === null) continue;

    const admin1 = typeof r.admin1 === 'string' ? r.admin1 : '';
    out.push({
      name,
      admin1,
      label: admin1 ? `${name}, ${admin1}` : name,
      latitude,
      longitude,
      elevation: typeof r.elevation === 'number' ? r.elevation : 0,
      timezone: typeof r.timezone === 'string' ? r.timezone : 'UTC',
    });
  }
  return out;
}
