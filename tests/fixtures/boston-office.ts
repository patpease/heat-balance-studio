/**
 * The golden case: a 500 m² single-storey office in Boston.
 *
 * 25 × 20 m, 3.5 m high, 30% window-to-wall ratio, at the default 70 °F
 * setpoint. Every figure the engine produces from this was computed
 * independently before the engine existed, and `boston-office.test.ts` checks
 * against those numbers rather than against whatever the code happens to say.
 *
 * The design day is the real one: ten years of ERA5 for 42.36 N, 71.06 W,
 * 2015–2024, run through the derivation the plan specifies — percentile over
 * all 87,672 hours for the minimum, mean normalised shape of the 76 cold days
 * for the profile, median cold-day range for the stretch.
 *
 * It is committed as data so that phase 01 and phase 02 can both be verified
 * without a live call.
 */

import { ALWAYS_ON, OFFICE_LIGHTING, OFFICE_MISC_EQUIPMENT, OFFICE_OCCUPANCY } from '../../src/model/schedules';
import { DEFAULT_SETPOINT_C, GROUND_RULE_OF_THUMB_C } from '../../src/model/defaults';
import type { Conditions, DesignDay, Envelope, Gains, Surface } from '../../src/model/types';

/** ERA5-derived hourly dry bulb for the Boston design day, °C. */
export const BOSTON_PROFILE_C = [
  -10.67, -11.59, -12.47, -13.02, -13.60, -14.10, -14.72, -15.30,
  -14.72, -13.89, -11.92, -9.73, -7.66, -5.84, -4.51, -3.58,
  -3.50, -4.37, -6.23, -7.72, -7.88, -8.43, -9.08, -9.72,
] as const;

export const BOSTON_DESIGN_DAY: DesignDay = {
  basis: 'era5-percentile',
  percentile: 0.4,
  yearsOfRecord: [2015, 2024],
  minimum: -15.3,
  dailyRange: 11.8,
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
    areaPerPerson: 500 / 27, // 27 people exactly, so the fixture is not sensitive to rounding
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
 * Expected results, computed independently of the engine.
 *
 * Hourly loss and gain in W, at a 21.111 °C setpoint with a constant 750 W
 * ground loss. If the engine and this table disagree, one of them is wrong and
 * the test does not care which.
 */
export const EXPECTED_HOURLY: readonly { hour: number; loss: number; gain: number }[] = [
  { hour: 0, loss: 8139, gain: 1887 },
  { hour: 1, loss: 8353, gain: 1887 },
  { hour: 2, loss: 8558, gain: 1887 },
  { hour: 3, loss: 8685, gain: 1887 },
  { hour: 4, loss: 8820, gain: 1887 },
  { hour: 5, loss: 8937, gain: 1887 },
  { hour: 6, loss: 9081, gain: 1887 },
  { hour: 7, loss: 9216, gain: 3778 },
  { hour: 8, loss: 9081, gain: 7588 },
  { hour: 9, loss: 8888, gain: 8499 },
  { hour: 10, loss: 8430, gain: 8499 },
  { hour: 11, loss: 7921, gain: 8499 },
  { hour: 12, loss: 7439, gain: 7588 },
  { hour: 13, loss: 7016, gain: 8499 },
  { hour: 14, loss: 6707, gain: 8499 },
  { hour: 15, loss: 6491, gain: 8499 },
  { hour: 16, loss: 6472, gain: 8499 },
  { hour: 17, loss: 6674, gain: 7588 },
  { hour: 18, loss: 7107, gain: 4428 },
  { hour: 19, loss: 7453, gain: 3151 },
  { hour: 20, loss: 7490, gain: 1887 },
  { hour: 21, loss: 7618, gain: 1887 },
  { hour: 22, loss: 7769, gain: 1887 },
  { hour: 23, loss: 7918, gain: 1887 },
];
