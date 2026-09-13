import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

import { isAllowedHost } from './src/climate/openMeteo';
import { CLIMATE_PATH, GEOCODE_PATH, handleClimate, handleGeocode } from './src/climate/relay';

/**
 * The same relay, on the dev server.
 *
 * Without this the dev server would 404 on /api/* and the only way to exercise
 * the weather path would be `preview:worker` — which is the build, not the
 * source. Mounting the identical handlers here is what makes "the logic running
 * at the edge is the logic exercised locally" true.
 *
 * It is NOT a second implementation: both this and worker/index.ts are ten-line
 * adapters over src/climate/relay.ts.
 */
function weatherRelay(): Plugin {
  const pinnedFetch = async (url: string) => {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !isAllowedHost(target.hostname)) {
      throw new Error(`Refusing to fetch ${target.hostname}`);
    }
    return fetch(target.toString(), { headers: { Accept: 'application/json' } });
  };

  return {
    name: 'heat-balance-weather-relay',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (url.pathname !== CLIMATE_PATH && url.pathname !== GEOCODE_PATH) return next();

        const result =
          url.pathname === CLIMATE_PATH
            ? await handleClimate(url.searchParams, pinnedFetch)
            : await handleGeocode(url.searchParams, pinnedFetch);

        response.statusCode = result.status;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify(result.body));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), weatherRelay()],
  // 5185/4185, not 5184/4184: zeel claimed those first and `strictPort`
  // turns a collision into a refusal to start rather than a silent hop to
  // another port, which is the behaviour we want from a relay that is also
  // serving the climate endpoints.
  server: { port: 5185, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
});
