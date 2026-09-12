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
 * The prose lives in copy.ts, which is the file Patrick edits. Re-exported here
 * so the export path and the Worker keep one import and there is never a second
 * copy of the same sentence to drift.
 */
export { EXCLUSIONS_STATEMENT, SCOPE_STATEMENT, WEATHER_ATTRIBUTION } from './copy';
