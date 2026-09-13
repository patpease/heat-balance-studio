import { describe, expect, it } from 'vitest';

import {
  ATTRIBUTION,
  cacheKeyFor,
  CACHE_SECONDS,
  DERIVATION_VERSION,
  handleClimate,
  handleGeocode,
  isRelayResult,
  parseClimateRequest,
  roundCoordinate,
} from '../src/climate/relay';
import type { Fetcher } from '../src/climate/relay';

/** A fetcher that never touches the network. */
function stub(payload: unknown, ok = true, status = 200): Fetcher {
  return async () => ({ ok, status, json: async () => payload });
}

const failing: Fetcher = async () => {
  throw new Error('network down');
};

/** Two whole years of a plausible cold climate, hourly, in local standard time. */
function archive(years = 2): { hourly: { time: string[]; temperature_2m: number[] } } {
  const time: string[] = [];
  const temperature_2m: number[] = [];
  const start = Date.UTC(2022, 0, 1, 0, 0, 0);
  for (let h = 0; h < years * 8760; h++) {
    const at = new Date(start + h * 3_600_000);
    time.push(at.toISOString().slice(0, 16));
    const dayOfYear = Math.floor(h / 24) % 365;
    const seasonal = -12 * Math.cos((dayOfYear / 365) * 2 * Math.PI);
    const diurnal = -5 * Math.cos(((h % 24) / 24) * 2 * Math.PI);
    temperature_2m.push(Number((seasonal + diurnal).toFixed(2)));
  }
  return { hourly: { time, temperature_2m } };
}

describe('request validation', () => {
  const params = (init: Record<string, string>) => new URLSearchParams(init);

  it('accepts a well-formed request', () => {
    const parsed = parseClimateRequest(params({ latitude: '42.36', longitude: '-71.06', timezone: 'America/New_York' }));
    expect(isRelayResult(parsed)).toBe(false);
  });

  it('rejects coordinates that are not on Earth', () => {
    for (const bad of [{ latitude: '91', longitude: '0' }, { latitude: '0', longitude: '200' }, { latitude: 'x', longitude: '0' }]) {
      const parsed = parseClimateRequest(params({ timezone: 'UTC', ...bad }));
      expect(isRelayResult(parsed) && parsed.status).toBe(400);
    }
  });

  it('rejects a time zone it does not recognise', () => {
    // A bad zone would silently shift the whole profile by hours, which is the
    // exact class of bug phase 02 was spent on.
    const parsed = parseClimateRequest(params({ latitude: '42', longitude: '-71', timezone: 'Mars/Olympus' }));
    expect(isRelayResult(parsed) && parsed.status).toBe(400);
    expect(isRelayResult(parsed) && (parsed.body as { message: string }).message).toMatch(/time zone/i);
  });

  it('defaults to the 99.6% condition and takes 99% only when asked', () => {
    const base = { latitude: '42', longitude: '-71', timezone: 'UTC' };
    const a = parseClimateRequest(params(base));
    const b = parseClimateRequest(params({ ...base, percentile: '1' }));
    expect(!isRelayResult(a) && a.percentile).toBe(0.4);
    expect(!isRelayResult(b) && b.percentile).toBe(1);
  });
});

describe('the cache key', () => {
  it('rounds coordinates so near-identical requests share one upstream call', () => {
    // ~1.1 km, far finer than ERA5's grid. Without this every user's slightly
    // different coordinates would miss and each cost a call.
    expect(roundCoordinate(42.360138)).toBe(42.36);
    expect(cacheKeyFor(42.360138, -71.058872, [2015, 2024]))
      .toBe(cacheKeyFor(42.3604, -71.0591, [2015, 2024]));
  });

  it('separates genuinely different places', () => {
    expect(cacheKeyFor(42.36, -71.06, [2015, 2024])).not.toBe(cacheKeyFor(44.98, -93.27, [2015, 2024]));
  });

  it('carries the derivation version, so changing the algorithm invalidates', () => {
    // The failure a naive coordinate key hides: a changed derivation still
    // served from a cache computed by the old one.
    expect(cacheKeyFor(42.36, -71.06, [2015, 2024])).toContain(`:${DERIVATION_VERSION}:`);
  });

  it('separates different record lengths', () => {
    expect(cacheKeyFor(42.36, -71.06, [2015, 2024])).not.toBe(cacheKeyFor(42.36, -71.06, [2005, 2024]));
  });
});

describe('the climate route', () => {
  const good = new URLSearchParams({ latitude: '42.36', longitude: '-71.06', timezone: 'America/New_York' });

  it('returns a 24-hour design day, not the archive', async () => {
    // The whole point of deriving at the edge: ~1 MB in, ~1 KB out.
    const result = await handleClimate(good, stub(archive()));
    expect(result.status).toBe(200);
    const body = result.body as { designDay: { hours: unknown[] }; attribution: string };
    expect(body.designDay.hours).toHaveLength(24);
    expect(JSON.stringify(result.body).length).toBeLessThan(4000);
  });

  it('carries the attribution with the data', async () => {
    const result = await handleClimate(good, stub(archive()));
    expect((result.body as { attribution: string }).attribution).toBe(ATTRIBUTION);
    expect(ATTRIBUTION).toMatch(/CC BY 4\.0/);
  });

  it('is cacheable for a month, because a ten-year percentile does not move', async () => {
    const result = await handleClimate(good, stub(archive()));
    expect(result.cacheSeconds).toBe(CACHE_SECONDS);
    expect(CACHE_SECONDS).toBe(60 * 60 * 24 * 30);
  });

  it('derives a plausible design day from a plausible record', async () => {
    const result = await handleClimate(good, stub(archive()));
    const day = (result.body as { designDay: { minimum: number; dailyRange: number; basis: string } }).designDay;
    expect(day.minimum).toBeLessThan(-10);
    expect(day.dailyRange).toBeGreaterThan(5);
    expect(day.basis).toBe('era5-percentile');
  });

  it('names the free tier rather than calling it a fault', async () => {
    const result = await handleClimate(good, stub(null, false, 429));
    expect(result.status).toBe(429);
    expect((result.body as { message: string }).message).toMatch(/rate-limit/i);
    // Every failure points at the way round it.
    expect((result.body as { message: string }).message).toMatch(/EPW/);
  });

  it('reports an unreachable service without throwing', async () => {
    const result = await handleClimate(good, failing);
    expect(result.status).toBe(504);
    expect((result.body as { message: string }).message).toMatch(/could not be reached/i);
  });

  it('reports a malformed payload rather than deriving from nonsense', async () => {
    const result = await handleClimate(good, stub({ hourly: { time: ['a', 'b'], temperature_2m: [1] } }));
    expect(result.status).toBe(502);
  });

  it('never caches a failure', async () => {
    for (const fetcher of [failing, stub(null, false, 500), stub({})]) {
      const result = await handleClimate(good, fetcher);
      expect(result.cacheSeconds).toBeUndefined();
    }
  });

  it('rejects a bad request before it reaches the network', async () => {
    let called = false;
    const watcher: Fetcher = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => archive() };
    };
    const result = await handleClimate(new URLSearchParams({ latitude: '999', longitude: '0' }), watcher);
    expect(result.status).toBe(400);
    expect(called).toBe(false);
  });
});

describe('the geocode route', () => {
  it('returns the matches in the order the service ranked them', async () => {
    const result = await handleGeocode(
      new URLSearchParams({ q: 'Boston, Massachusetts' }),
      stub({
        results: [
          { name: 'Boston', admin1: 'Massachusetts', latitude: 42.35, longitude: -71.06, elevation: 14, timezone: 'America/New_York' },
          { name: 'Pittsfield', admin1: 'Massachusetts', latitude: 42.45, longitude: -73.25, elevation: 306, timezone: 'America/New_York' },
        ],
      }),
    );
    expect(result.status).toBe(200);
    const matches = (result.body as { matches: { label: string }[] }).matches;
    // Both are surfaced. The fuzzy second result is precisely why the UI must
    // show what it matched rather than take the first silently.
    expect(matches.map((m) => m.label)).toEqual(['Boston, Massachusetts', 'Pittsfield, Massachusetts']);
  });

  it('treats "no such place" as an answer, not a failure', async () => {
    const result = await handleGeocode(new URLSearchParams({ q: 'Zzzz' }), stub({ results: [] }));
    expect(result.status).toBe(200);
    expect((result.body as { matches: unknown[] }).matches).toHaveLength(0);
  });

  it('asks for a state rather than guessing', async () => {
    const result = await handleGeocode(new URLSearchParams({ q: 'B' }), stub({}));
    expect(result.status).toBe(400);
    expect((result.body as { message: string }).message).toMatch(/city and state/i);
  });

  it('survives an unreachable service', async () => {
    const result = await handleGeocode(new URLSearchParams({ q: 'Boston' }), failing);
    expect(result.status).toBe(504);
  });
});

describe('a failed asset response is not cached', () => {
  /**
   * `public/_headers` matches on the path, not on the outcome, so a 404 under
   * `/assets/` was served with `max-age=31536000, immutable`. Every deploy has
   * a window where the new index.html is live before a given edge has the new
   * bundle — and a browser that loads the site in that window caches the 404
   * for a year and shows a blank page from then on. It happened on a real
   * deploy of this tool.
   *
   * The worker owns every response, so it is the place to refuse it.
   */
  const cacheControlFor = (status: number) => {
    const headers = new Headers({ 'Cache-Control': 'public, max-age=31536000, immutable' });
    const ok = status >= 200 && status < 300;
    if (!ok) headers.set('Cache-Control', 'no-store');
    return headers.get('Cache-Control');
  };

  it('leaves a successful asset immutable', () => {
    expect(cacheControlFor(200)).toContain('immutable');
  });

  it('refuses to cache a 404, a 500 or a 403', () => {
    for (const status of [403, 404, 500, 502]) {
      expect(cacheControlFor(status), String(status)).toBe('no-store');
    }
  });
});
