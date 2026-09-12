/**
 * The two Workers globals this adapter uses.
 *
 * Declared locally rather than pulling in @cloudflare/workers-types, which
 * replaces the DOM lib wholesale and would then have to be isolated behind its
 * own tsconfig — a lot of machinery for two symbols. If the Worker ever grows
 * past an adapter, swap this for the real types and split the config.
 */

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/**
 * `caches.default` is Cloudflare's own edge cache and is not part of the DOM
 * CacheStorage interface, so it is declared here rather than cast at each use.
 */
interface CacheStorage {
  readonly default: Cache;
}
