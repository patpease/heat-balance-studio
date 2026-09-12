/**
 * Cloudflare Worker entry point.
 *
 * The site deploys through Workers, NOT Pages. They are different products and
 * the difference has broken a sibling's deploy: a Pages-style `functions/`
 * directory is silently ignored here, and without a script every unrecognised
 * path falls through to the application shell — so a relay that was never
 * deployed answers `200 text/html` rather than `404`.
 *
 * Under Workers the shape is explicit: one script owns every request, handles
 * what it recognises, and hands the rest to the static assets binding.
 *
 * This file is an ADAPTER and nothing more. Every piece of judgement —
 * host pinning, cache keys, error text, the design-day derivation — lives in
 * `src/climate/`, which the Vite dev server also serves, so the logic running
 * at the edge is the logic exercised locally.
 */

interface Env {
  /** Static assets, bound by `assets.binding` in wrangler.jsonc. */
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

/**
 * Security headers.
 *
 * `connect-src 'self'` is true and stays true because the browser never talks
 * to Open-Meteo directly — it talks to our own /api/*. The policy therefore has
 * no third-party origin in it at all.
 *
 * `style-src` has NO 'unsafe-inline', following ZEEL rather than psychro. That
 * constrains the code permanently: a value that varies per element cannot be a
 * `style` prop. Arrow scales go on CSS classes; SVG marks use presentation
 * attributes (`fill`, `stroke`), which the policy does not govern.
 */
const SECURITY_HEADERS: Record<string, string> = {
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
  // Nothing here uses a camera, a microphone, or a location. Saying so stops a
  // future dependency from quietly asking.
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API routes land here in phase 06. Until then an /api/* path must 404
    // rather than fall through to the shell — the failure mode this whole
    // file exists to prevent.
    if (url.pathname.startsWith('/api/')) {
      return json({ message: 'Not found.' }, 404);
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...SECURITY_HEADERS,
    },
  });
}
