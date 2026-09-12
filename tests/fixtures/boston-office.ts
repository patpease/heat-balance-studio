/**
 * The golden case: a 500 m² single-storey office in Boston.
 *
 * 25 × 20 m, 3.5 m high, 30% window-to-wall ratio, at the default 70 °F
 * setpoint. Every figure here was computed independently of the engine, and
 * `balance.test.ts` checks against those numbers rather than against whatever
 * the code happens to say.
 *
 * The design day is the real one: ten years of ERA5 for 42.36 N, 71.06 W,
 * 2015–2024, run through the derivation the plan specifies — percentile over
 * all 87,672 hours for the minimum, mean normalised shape of the 80 cold days
 * for the profile, median cold-day range for the stretch.
 *
 * It is committed as data so that phase 01 and phase 02 can both be verified
 * without a live call. `designDay.test.ts` regenerates this profile from the
 * raw record and asserts it matches, so the two cannot drift apart.
 *
 * **The profile is in LOCAL STANDARD TIME.** It was an hour later than this
 * until phase 02: Open-Meteo stamps a whole series with whichever UTC offset is
 * in force when the request is made, so a winter record pulled in September
 * came back labelled EDT rather than EST. Correcting that moved the minimum
 * from hour 7 to hour 6 and changed the answer — see `designDay.ts`.
 */

import { ALWAYS_ON, OFFICE_LIGHTING, OFFICE_MISC_EQUIPMENT, OFFICE_OCCUPANCY } from '../../src/model/schedules';
import { DEFAULT_SETPOINT_C, GROUND_RULE_OF_THUMB_C } from '../../src/model/defaults';
import type { Conditions, DesignDay, Envelope, Gains, Surface } from '../../src/model/types';

/** ERA5-derived hourly dry bulb for the Boston design day, °C. */
export const BOSTON_PROFILE_C = [
  -11.37, -12.27, -12.82, -13.41, -13.96, -14.65, -15.30, -14.77,
  -13.93, -11.97, -9.82, -7.74, -5.91, -4.57, -3.65, -3.60,
  -4.44, -6.33, -7.89, -8.11, -8.74, -9.57, -10.34, -10.85,
] as const;

export const BOSTON_DESIGN_DAY: DesignDay = {
  basis: 'era5-percentile',
  percentile: 0.4,
  yearsOfRecord: [2015, 2024],
  minimum: -15.3,
  dailyRange: 11.7,
  hours: BOSTON_PROFILE_C.map((tdb, hour) => ({
    hour,
    tdb,
    ghi: null,
    dni: null,
    dhi: null,
  })),
  // 10.9 °C. Drift from the 55 °F rule of thumb is 1.9 K, inside the 3 K
  // limit — so Boston keeps the rule of thumb and this value is a cross-check
  // rather than the driver.
  annualMeanTemperature: 10.9,
  provenance: 'ERA5 via Open-Meteo, coldest 0.4% of hours, 2015–2024',
};

const base = { bufferFactor: 1, orientation: null, shgc: null } as const;

/**
 * Areas from the geometry: 90 m perimeter × 3.5 m = 315 m² gross wall, of which
 * 30% is glazing. Roof and ground floor are the 500 m² footprint. No exposed
 * floor — it stays as a visible zero.
 */
export const BOSTON_SURFACES: Surface[] = [
  { id: 'walls', category: 'wall', label: 'Walls', area: 220.5, uValue: 0.20, boundary: 'air', ...base },
  { id: 'windows', category: 'window', label: 'Windows', area: 94.5, uValue: 1.20, boundary: 'air', ...base },
  { id: 'roof', category: 'roof', label: 'Roof', area: 500, uValue: 0.15, boundary: 'air', ...base },
  { id: 'ground-floor', category: 'groundFloor', label: 'Ground floor', area: 500, uValue: 0.18, boundary: 'ground', ...base },
  { id: 'exposed-floor', category: 'exposedFloor', label: 'Exposed floor', area: 0, uValue: 0.25, boundary: 'air', ...base },
];

export const BOSTON_ENVELOPE: Envelope = {
  floorArea: 500,
  storeyHeight: 3.5,
  storeys: 1,
  surfaces: BOSTON_SURFACES,
};

export const BOSTON_GAINS: Gains = {
  occupancy: {
    mode: 'density',
    // 27 people exactly, so the fixture is not sensitive to rounding.
    areaPerPerson: 500 / 27,
    count: 0,
    sensiblePerPerson: 75,
  },
  lighting: { powerDensity: 6.5 },
  miscEquipment: { powerDensity: 7.0 },
  itEquipment: { powerDensity: 1.0, spaceFraction: 1 },
  schedules: {
    occupancy: OFFICE_OCCUPANCY,
    lighting: OFFICE_LIGHTING,
    miscEquipment: OFFICE_MISC_EQUIPMENT,
    itEquipment: ALWAYS_ON,
  },
  preset: 'Office (provisional)',
};

export const BOSTON_CONDITIONS: Conditions = {
  indoorSetpoint: DEFAULT_SETPOINT_C,
  groundTemperature: GROUND_RULE_OF_THUMB_C,
  groundTemperatureBasis: 'rule-of-thumb',
};

export const BOSTON_CASE = {
  envelope: BOSTON_ENVELOPE,
  gains: BOSTON_GAINS,
  conditions: BOSTON_CONDITIONS,
  designDay: BOSTON_DESIGN_DAY,
} as const;

/**
 * Hourly loss and gain in W, at a 21.111 °C setpoint with a constant 750 W
 * ground loss, against the committed two-decimal profile above.
 *
 * If the engine and this table disagree, one of them is wrong and the test does
 * not care which.
 */
export const EXPECTED_HOURLY: readonly { hour: number; loss: number; gain: number }[] = [
  { hour: 0, loss: 8302, gain: 1888 },
  { hour: 1, loss: 8511, gain: 1888 },
  { hour: 2, loss: 8639, gain: 1888 },
  { hour: 3, loss: 8776, gain: 1888 },
  { hour: 4, loss: 8904, gain: 1888 },
  { hour: 5, loss: 9064, gain: 1888 },
  { hour: 6, loss: 9216, gain: 1888 },
  { hour: 7, loss: 9092, gain: 3778 },
  { hour: 8, loss: 8897, gain: 7588 },
  { hour: 9, loss: 8441, gain: 8499 },
  { hour: 10, loss: 7941, gain: 8499 },
  { hour: 11, loss: 7458, gain: 8499 },
  { hour: 12, loss: 7032, gain: 7588 },
  { hour: 13, loss: 6721, gain: 8499 },
  { hour: 14, loss: 6507, gain: 8499 },
  { hour: 15, loss: 6495, gain: 8499 },
  { hour: 16, loss: 6691, gain: 8499 },
  { hour: 17, loss: 7130, gain: 7588 },
  { hour: 18, loss: 7493, gain: 4428 },
  { hour: 19, loss: 7544, gain: 3151 },
  { hour: 20, loss: 7690, gain: 1888 },
  { hour: 21, loss: 7883, gain: 1888 },
  { hour: 22, loss: 8062, gain: 1888 },
  { hour: 23, loss: 8181, gain: 1888 },
];
