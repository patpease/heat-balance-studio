/**
 * Cloudflare Worker entry point.
 *
 * The site deploys through Workers, NOT Pages. They are different products and
 * the difference has broken a sibling's deploy: a Pages-style `functions/`
 * directory is silently ignored here, and without a script every unrecognised
 * path falls through to the application shell — so a relay that was never
 * deployed answers `200 text/html` rather than `404`.
 *
 * This file is an ADAPTER and nothing more. Every piece of judgement — cache
 * keys, the derivation, error text — lives in `src/climate/`, which the Vite
 * dev middleware serves through the same functions, so the logic running at the
 * edge is the logic exercised locally.
 */

import { defaultDateRange, isAllowedHost } from '../src/climate/openMeteo';
import {
  cacheKeyFor,
  CLIMATE_PATH,
  GEOCODE_PATH,
  handleClimate,
  handleGeocode,
  isRelayResult,
  parseClimateRequest,
} from '../src/climate/relay';

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

/**
 * `connect-src 'self'` is true and stays true because the browser never talks
 * to Open-Meteo directly — it talks to our own /api/*. The policy therefore has
 * no third-party origin in it at all.
 *
 * `style-src` has NO 'unsafe-inline'. React writes the style prop through the
 * CSSOM rather than as a style attribute, which CSP does not govern, so this
 * holds — but a literal style="…" in emitted markup WOULD be blocked, which is
 * why the PNG export uses presentation attributes.
 */
const HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
};

/**
 * The only code here that can reach the network, and it refuses anything that
 * is not an exact Open-Meteo host over https.
 *
 * An exact match, never a suffix: `open-meteo.com.example.com` ends with the
 * allowed string, and a relay that fetches whatever URL it is handed is an open
 * proxy running on our own domain.
 */
async function pinnedFetch(url: string) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !isAllowedHost(target.hostname)) {
    throw new Error(`Refusing to fetch ${target.hostname}`);
  }
  return fetch(target.toString(), { headers: { Accept: 'application/json' } });
}

function json(body: unknown, status: number, cacheSeconds?: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...HEADERS,
      'Cache-Control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-store',
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === CLIMATE_PATH || url.pathname === GEOCODE_PATH) {
      if (request.method !== 'GET') return json({ message: 'Use GET.' }, 405);

      // The edge cache is what keeps this inside a 10,000-call-a-day free tier:
      // everyone asking about the same city shares one upstream call for a
      // month. Keyed on rounded coordinates PLUS the derivation version, so
      // changing the algorithm invalidates rather than serving stale maths —
      // the failure a naive coordinate key hides.
      let cacheKey: Request | null = null;
      if (url.pathname === CLIMATE_PATH) {
        const parsed = parseClimateRequest(url.searchParams);
        if (!isRelayResult(parsed)) {
          const { years } = defaultDateRange();
          const key = cacheKeyFor(parsed.latitude, parsed.longitude, years);
          cacheKey = new Request(`https://cache.invalid/${encodeURIComponent(key)}`);
          const hit = await caches.default.match(cacheKey);
          if (hit) return hit;
        }
      }

      const result =
        url.pathname === CLIMATE_PATH
          ? await handleClimate(url.searchParams, pinnedFetch)
          : await handleGeocode(url.searchParams, pinnedFetch);

      const response = json(result.body, result.status, result.cacheSeconds);

      if (cacheKey && result.status === 200 && result.cacheSeconds) {
        // waitUntil so the cache write does not delay the answer.
        ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
      }
      return response;
    }

    // Any other /api/* path must 404 rather than fall through to the shell.
    if (url.pathname.startsWith('/api/')) return json({ message: 'Not found.' }, 404);

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(HEADERS)) headers.set(key, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
