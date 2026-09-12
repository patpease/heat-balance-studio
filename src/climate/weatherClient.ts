/**
 * Talking to our own /api/*.
 *
 * The browser has exactly one outbound origin: itself. That is what keeps
 * `connect-src 'self'` honest.
 *
 * **The design promise this file has to keep: the tool works with the relay
 * down.** Every function here returns a discriminated result rather than
 * throwing, so a failure is something the UI reports next to a design day that
 * still exists — never a blank screen. The bundled sample is the floor.
 */

import { CLIMATE_PATH, GEOCODE_PATH } from './relay';
import type { ClimatePayload, GeocodePayload } from './relay';
import type { GeocodeMatch } from './openMeteo';

export type ClientResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

/** Anything we did not anticipate still has to reach the user as a sentence. */
const UNREACHABLE = 'Could not reach the weather service. The design day already loaded is still in use.';

async function getJson<T>(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<ClientResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${path}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, message: '' };
    }
    return { ok: false, message: UNREACHABLE };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // A relay that was never deployed answers with the application shell, and
    // an HTML body fails to parse here rather than pretending to be data. This
    // is exactly the failure the Worker's not_found_handling setting prevents.
    return { ok: false, message: 'The weather route is not responding with data. Is the relay deployed?' };
  }

  if (!response.ok) {
    const message = (body as { message?: unknown })?.message;
    return { ok: false, message: typeof message === 'string' ? message : UNREACHABLE };
  }
  return { ok: true, value: body as T };
}

export function searchPlaces(query: string, signal?: AbortSignal): Promise<ClientResult<readonly GeocodeMatch[]>> {
  return getJson<GeocodePayload>(GEOCODE_PATH, new URLSearchParams({ q: query }), signal).then((result) =>
    result.ok ? { ok: true as const, value: result.value.matches } : result,
  );
}

export function fetchDesignDay(
  match: Pick<GeocodeMatch, 'latitude' | 'longitude' | 'timezone'>,
  percentile: 0.4 | 1,
  signal?: AbortSignal,
): Promise<ClientResult<ClimatePayload>> {
  return getJson<ClimatePayload>(
    CLIMATE_PATH,
    new URLSearchParams({
      latitude: String(match.latitude),
      longitude: String(match.longitude),
      timezone: match.timezone,
      percentile: percentile === 1 ? '1' : '0.4',
    }),
    signal,
  );
}
