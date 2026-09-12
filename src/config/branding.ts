/**
 * Brand constants stamped onto every export.
 *
 * `host` and the deployed route must move together — ZEEL records this as the
 * thing that is easy to forget, because an export carrying the wrong hostname
 * outlives the deploy that produced it.
 */
export const BRAND = {
  name: 'Heat Balance Studio',
  studio: 'Pease Studio',
  host: 'heatbalance.peasestudio.com',
} as const;

/**
 * The standing statement. Permanent page furniture and burned into every
 * export — not a tooltip, and not buried in a docs folder.
 *
 * Two separate claims, both load-bearing:
 *  - what the tool IS NOT (a compliance calculation)
 *  - what it LEAVES OUT (ventilation and infiltration)
 */
export const SCOPE_STATEMENT =
  'A theoretical screen built on historic weather data. It does not replace a ' +
  'formal heat loss calculation performed to ASHRAE standards.';

export const EXCLUSIONS_STATEMENT =
  'Envelope-only, sensible-heat screen. Ventilation and infiltration are not ' +
  'counted, so a passing result is optimistic.';

/** Open-Meteo is CC BY 4.0 and the attribution travels with the data. */
export const WEATHER_ATTRIBUTION =
  'Weather data © Open-Meteo (ERA5), CC BY 4.0.';
