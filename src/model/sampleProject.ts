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

import { leakageOf } from './airtightness';
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
  // February: 35 of Boston's 76 cold days fall there, more than any other
  // month. Its ten-year mean is −0.6 °C — 30.9 °F — which is 13.4 K from the
  // 55 °F rule of thumb, so a Boston searched today resolves to its own figure
  // rather than the default. The worked example below keeps 55 °F because that
  // is one of its STATED inputs, not something it derives.
  designMonth: 2,
  designMonthMeanTemperature: -0.6,
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
  // The worked example is a code-compliant new build, so it gets the grade a
  // new build is required to reach. This is the one change that moves §3.8's
  // numbers, and it moves them because the tool was leaving heat out.
  airtightness: leakageOf('typical'),
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
  // 0.5 kW over this example's 500 m² is the 1.0 W/m² this line used to read,
  // to the watt — the golden case is unchanged by the move to absolute kW, and
  // balance.test.ts proves it. The shipped DEFAULT is zero; this example
  // carries a value so the ninth arrow has something to draw.
  itEquipment: { kilowatts: 0.5, cooling: 'air' },
  schedules: {
    occupancy: OFFICE_OCCUPANCY,
    lighting: OFFICE_LIGHTING,
    miscEquipment: OFFICE_MISC_EQUIPMENT,
    itEquipment: ALWAYS_ON,
  },
  preset: 'Office (provisional)',
  // The worked example is not one of the building types, so it has no massing
  // of its own and the drawing falls back to the office.
  sourceId: null,
};

export const SAMPLE_CONDITIONS: Conditions = {
  indoorSetpoint: DEFAULT_SETPOINT_C,
  groundTemperature: GROUND_RULE_OF_THUMB_C,
  groundTemperatureBasis: 'rule-of-thumb',
  // The worked example carries the real diurnal profile. Flattening it would
  // change every figure in §3.8, which is the one thing the golden case exists
  // to stop.
  flatDesignDay: false,
  // Boston Logan, effectively at sea level, so the air is not thinned.
  siteElevation: 6,
};

export const SAMPLE_CASE = {
  envelope: SAMPLE_ENVELOPE,
  gains: SAMPLE_GAINS,
  conditions: SAMPLE_CONDITIONS,
  designDay: SAMPLE_DESIGN_DAY,
} as const;
