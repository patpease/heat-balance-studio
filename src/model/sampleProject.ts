/**
 * The worked example, as shipped data.
 *
 * A 500 m² single-storey office in Boston — 25 × 20 m, 3.5 m high, 30%
 * window-to-wall — on the ERA5 design day derived for 42.36 N, 71.06 W.
 *
 * It lives in `src` rather than in `tests` for two reasons. The app **opens on
 * it** instead of on an empty form, so the first look shows what the tool does
 * rather than a blank shell. And the golden test measures the same object the
 * user sees, so the two cannot drift apart.
 *
 * The design-day profile here is in LOCAL STANDARD TIME and is the output of
 * `deriveDesignDay` against the committed ten-year record —
 * `tests/designDay.test.ts` regenerates it and asserts they match.
 */

import { ALWAYS_ON, OFFICE_LIGHTING, OFFICE_MISC_EQUIPMENT, OFFICE_OCCUPANCY } from './schedules';
import { DEFAULT_SETPOINT_C, GROUND_RULE_OF_THUMB_C } from './defaults';
import type { Conditions, DesignDay, Envelope, Gains, Site, Surface } from './types';

export const SAMPLE_PROFILE_C = [
  -11.37, -12.27, -12.82, -13.41, -13.96, -14.65, -15.30, -14.77,
  -13.93, -11.97, -9.82, -7.74, -5.91, -4.57, -3.65, -3.60,
  -4.44, -6.33, -7.89, -8.11, -8.74, -9.57, -10.34, -10.85,
] as const;

export const SAMPLE_SITE: Site = {
  label: 'Boston, Massachusetts',
  latitude: 42.3601,
  longitude: -71.0589,
  elevation: 14,
  timezone: 'America/New_York',
  source: 'geocoded',
};

export const SAMPLE_DESIGN_DAY: DesignDay = {
  basis: 'era5-percentile',
  percentile: 0.4,
  yearsOfRecord: [2015, 2024],
  minimum: -15.3,
  dailyRange: 11.7,
  hours: SAMPLE_PROFILE_C.map((tdb, hour) => ({ hour, tdb, ghi: null, dni: null, dhi: null })),
  // Drift from the 55 °F rule of thumb is 1.9 K, inside the 3 K limit — so
  // Boston keeps the rule of thumb and this is a cross-check, not the driver.
  annualMeanTemperature: 10.9,
  provenance: 'ERA5 via Open-Meteo, coldest 0.4% of hours, 2015–2024',
};

const base = { bufferFactor: 1, orientation: null, shgc: null } as const;

/**
 * 90 m perimeter × 3.5 m = 315 m² gross wall, 30% of it glazed. Roof and ground
 * floor are the 500 m² footprint. No exposed floor — it stays a visible zero,
 * because a greyed row reading "none" teaches that the category exists.
 */
export const SAMPLE_SURFACES: Surface[] = [
  { id: 'walls', category: 'wall', label: 'Walls', area: 220.5, uValue: 0.20, boundary: 'air', ...base },
  { id: 'windows', category: 'window', label: 'Windows', area: 94.5, uValue: 1.20, boundary: 'air', ...base },
  { id: 'roof', category: 'roof', label: 'Roof', area: 500, uValue: 0.15, boundary: 'air', ...base },
  { id: 'ground-floor', category: 'groundFloor', label: 'Ground floor', area: 500, uValue: 0.18, boundary: 'ground', ...base },
  { id: 'exposed-floor', category: 'exposedFloor', label: 'Exposed floor', area: 0, uValue: 0.25, boundary: 'air', ...base },
];

export const SAMPLE_ENVELOPE: Envelope = {
  floorArea: 500,
  storeyHeight: 3.5,
  storeys: 1,
  surfaces: SAMPLE_SURFACES,
};

export const SAMPLE_GAINS: Gains = {
  occupancy: {
    mode: 'density',
    // 27 people exactly, so the example is not sensitive to rounding.
    areaPerPerson: 500 / 27,
    count: 0,
    sensiblePerPerson: 75,
  },
  lighting: { powerDensity: 6.5 },
  miscEquipment: { powerDensity: 7.0 },
  // 1.0 W/m² is an IDF closet rather than a data hall. The shipped DEFAULT is
  // zero; this example carries a value so the ninth arrow has something to draw.
  itEquipment: { powerDensity: 1.0, spaceFraction: 1 },
  schedules: {
    occupancy: OFFICE_OCCUPANCY,
    lighting: OFFICE_LIGHTING,
    miscEquipment: OFFICE_MISC_EQUIPMENT,
    itEquipment: ALWAYS_ON,
  },
  preset: 'Office (provisional)',
};

export const SAMPLE_CONDITIONS: Conditions = {
  indoorSetpoint: DEFAULT_SETPOINT_C,
  groundTemperature: GROUND_RULE_OF_THUMB_C,
  groundTemperatureBasis: 'rule-of-thumb',
};

export const SAMPLE_CASE = {
  envelope: SAMPLE_ENVELOPE,
  gains: SAMPLE_GAINS,
  conditions: SAMPLE_CONDITIONS,
  designDay: SAMPLE_DESIGN_DAY,
} as const;
