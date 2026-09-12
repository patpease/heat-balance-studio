/**
 * The weather relay — all of the judgement, none of the plumbing.
 *
 * The Worker route and the Vite dev middleware are both thin adapters around
 * this file, which is what makes "the logic running at the edge is the logic
 * exercised locally" true rather than aspirational.
 *
 * **Why relay at all, when Open-Meteo sends CORS headers?** Three things a
 * direct browser fetch cannot buy:
 *
 *  - a CSP with `connect-src 'self'` and no third-party origin in it,
 *  - an edge cache shared across everyone asking about the same city, which is
 *    what keeps this inside a 10,000-call-a-day free tier,
 *  - the derivation running server-side, so ~1 MB of hourly archive never
 *    crosses the wire — the browser receives a 24-hour design day instead.
 */

import { deriveDesignDay } from './designDay';
import type { Derivation } from './designDay';
import {
  archiveUrl,
  defaultDateRange,
  geocodeUrl,
  matchesFromGeocode,
  samplesFromArchive,
  standardOffsetSeconds,
  WeatherDataError,
} from './openMeteo';
import type { GeocodeMatch } from './openMeteo';

export const CLIMATE_PATH = '/api/climate';
export const GEOCODE_PATH = '/api/geocode';

/**
 * Bumping this invalidates every cached design day.
 *
 * The cache key is lat/lon plus years, so a change to the DERIVATION would
 * otherwise keep serving results computed by the old algorithm — the failure a
 * naive coordinate key hides. Bump it whenever `designDay.ts` changes in a way
 * that moves a number.
 */
export const DERIVATION_VERSION = '2';

/** A ten-year climate percentile does not move faster than this. */
export const CACHE_SECONDS = 60 * 60 * 24 * 30;

export interface RelayResult {
  readonly status: number;
  readonly body: unknown;
  /** Cache-Control for the response, when it is cacheable. */
  readonly cacheSeconds?: number;
}

function problem(status: number, message: string): RelayResult {
  return { status, body: { message } };
}

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

/**
 * Round to two decimals — about 1.1 km, far finer than ERA5's own grid.
 *
 * Without rounding, every user's slightly different coordinates would miss the
 * cache and each cost an upstream call, which is how a free tier gets spent.
 */
export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function cacheKeyFor(latitude: number, longitude: number, years: readonly [number, number]): string {
  return [
    'climate',
    DERIVATION_VERSION,
    roundCoordinate(latitude).toFixed(2),
    roundCoordinate(longitude).toFixed(2),
    years[0],
    years[1],
  ].join(':');
}

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

export interface ClimateRequest {
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
  readonly percentile: number;
}

export function parseClimateRequest(params: URLSearchParams): ClimateRequest | RelayResult {
  const latitude = Number(params.get('latitude'));
  const longitude = Number(params.get('longitude'));
  const timezone = params.get('timezone') ?? 'UTC';
  const percentile = params.get('percentile') === '1' ? 1 : 0.4;

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return problem(400, 'That latitude is not on Earth. Pick the location again.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return problem(400, 'That longitude is not on Earth. Pick the location again.');
  }
  // A bad zone would silently shift the whole profile by hours, so it is
  // validated rather than defaulted past.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    return problem(400, `"${timezone}" is not a time zone this tool recognises.`);
  }

  return { latitude, longitude, timezone, percentile };
}

export function isRelayResult(value: unknown): value is RelayResult {
  return typeof value === 'object' && value !== null && 'status' in value;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface ClimatePayload {
  readonly designDay: Derivation['designDay'];
  readonly diagnostics: Derivation['diagnostics'] & { readonly droppedHours: number };
  readonly attribution: string;
}

export const ATTRIBUTION = 'Weather data © Open-Meteo (ERA5), CC BY 4.0.';

/**
 * Fetch ten years of hourly archive and return a 24-hour design day.
 *
 * Note what does NOT come back: the 87,672 hourly values. The derivation runs
 * here so the browser receives about a kilobyte.
 */
export async function handleClimate(
  params: URLSearchParams,
  fetcher: Fetcher,
  today = new Date(),
): Promise<RelayResult> {
  const parsed = parseClimateRequest(params);
  if (isRelayResult(parsed)) return parsed;

  const { startDate, endDate, years } = defaultDateRange(today);
  const url = archiveUrl({
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    startDate,
    endDate,
  });

  let payload: unknown;
  try {
    const response = await fetcher(url);
    if (!response.ok) {
      // 429 is the one worth naming: it is the free tier, not a fault.
      return problem(
        response.status === 429 ? 429 : 502,
        response.status === 429
          ? 'The weather service is rate-limiting requests just now. Try again shortly, or drop in an EPW file.'
          : `The weather service returned ${response.status}. Try again shortly, or drop in an EPW file.`,
      );
    }
    payload = await response.json();
  } catch {
    return problem(504, 'The weather service could not be reached. Try again, or drop in an EPW file.');
  }

  try {
    const offset = standardOffsetSeconds(parsed.timezone);
    const { samples, dropped } = samplesFromArchive(payload as never, offset);
    const { designDay, diagnostics } = deriveDesignDay(samples, {
      percentile: parsed.percentile,
      yearsOfRecord: years,
    });

    return {
      status: 200,
      body: {
        designDay,
        diagnostics: { ...diagnostics, droppedHours: dropped },
        attribution: ATTRIBUTION,
      } satisfies ClimatePayload,
      cacheSeconds: CACHE_SECONDS,
    };
  } catch (error) {
    if (error instanceof WeatherDataError) return problem(502, error.message);
    return problem(500, 'The weather record could not be read.');
  }
}

export interface GeocodePayload {
  readonly matches: readonly GeocodeMatch[];
  readonly attribution: string;
}

export async function handleGeocode(params: URLSearchParams, fetcher: Fetcher): Promise<RelayResult> {
  const query = (params.get('q') ?? '').trim();
  if (query.length < 2) {
    return problem(400, 'Type a city and state — "Boston, Massachusetts".');
  }

  try {
    const response = await fetcher(geocodeUrl(query));
    if (!response.ok) {
      return problem(502, `The location service returned ${response.status}. Try again shortly.`);
    }
    const matches = matchesFromGeocode(await response.json());
    return {
      status: 200,
      // An empty list is a valid answer, not an error — "no such place" is
      // something the UI should say plainly rather than dress as a failure.
      body: { matches, attribution: ATTRIBUTION } satisfies GeocodePayload,
      cacheSeconds: CACHE_SECONDS,
    };
  } catch {
    return problem(504, 'The location service could not be reached.');
  }
}
