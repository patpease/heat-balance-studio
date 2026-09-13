/**
 * Starting values.
 *
 * **These are DERIVED, not typed.** Every density and every schedule below comes
 * from the Medium Office row of `gainPresets.ts`, which is generated from the
 * PNNL prototype scorecards. Editing a number here does nothing; edit the sheet
 * in `docs/gain-data/` and re-run `npm run import:gains`.
 *
 * Lighting is the one exception, and it is deliberate: the PNNL models are the
 * 90.1-2004 vintage, whose lighting runs well above current code. In a tool
 * asking whether a building can need no heating, overstated lighting flatters
 * every answer — so lighting comes from the 90.1 Building Area Method instead.
 *
 * IT equipment ships at ZERO rather than at a plausible-looking number. 90.1
 * does not break receptacle load into IT and misc, and real values span three
 * orders of magnitude — an IDF closet is a fraction of a W/m² of building area,
 * a data hall is hundreds of W/m² of white space. A single shipped default
 * would look authoritative and be wrong most of the time.
 */

import { DEFAULT_PRESET_ID, presetById } from './gainPresets';
import type { GainPreset } from './gainPresets';
import { presetSchedules } from './presetSchedules';
import type { Conditions, Gains, Surface } from './types';
import { fromF } from './units';

/** 70 °F exactly, in canonical °C. Settled: the default US office setpoint. */
export const DEFAULT_SETPOINT_C = fromF(70);

/** 55 °F exactly, in canonical °C. The recognised ground rule of thumb. */
export const GROUND_RULE_OF_THUMB_C = fromF(55);

/**
 * How far the site's annual mean air temperature may sit from the rule of thumb
 * before the tool abandons it. Beyond this the derived mean takes over.
 *
 * 3 K is a threshold rather than a blend, so two nearly identical sites either
 * side of it get ground temperatures 3 K apart. Denver, at 2.9 K, is one good
 * year of data from flipping. The step is visible — the field always names the
 * basis it resolved to — which is the argument for the simpler rule.
 */
export const GROUND_DRIFT_LIMIT_K = 3;

export interface DensityDefault {
  readonly value: number;
  readonly citation: string;
}

/**
 * The row the tool opens on — Large Office. Every default below is derived from
 * it, and the app's initial gains are these.
 *
 * Large rather than Medium because it is the most common thing a user of this
 * tool is sizing up, and because its equipment density sits between the small
 * and medium offices rather than at either edge.
 */
export const OFFICE_PRESET: GainPreset = presetById(DEFAULT_PRESET_ID) ?? (() => {
  // A missing office row is a build error, not a runtime fallback: every other
  // default in this file is derived from it.
  throw new Error(`gainPresets has no "${DEFAULT_PRESET_ID}" row`);
})();

/** A null in the sheet means "no default". The engine still needs a number. */
function densityOf(density: { value: number | null; citation: string }): DensityDefault {
  return { value: density.value ?? 0, citation: density.citation };
}

export const OFFICE_DENSITIES = {
  /** m² per person. */
  areaPerPerson: densityOf(OFFICE_PRESET.areaPerPerson),
  /** W per person, sensible only. */
  sensiblePerPerson: densityOf(OFFICE_PRESET.sensiblePerPerson),
  /** W/m². */
  lighting: densityOf(OFFICE_PRESET.lighting),
  /** W/m². */
  miscEquipment: densityOf(OFFICE_PRESET.miscEquipment),
  /** W/m². Zero: the sheet leaves IT blank, which is "no default", not a value. */
  itEquipment: densityOf(OFFICE_PRESET.itEquipment),
} as const satisfies Record<string, DensityDefault>;

export const DEFAULT_CONDITIONS: Conditions = {
  indoorSetpoint: DEFAULT_SETPOINT_C,
  groundTemperature: GROUND_RULE_OF_THUMB_C,
  groundTemperatureBasis: 'rule-of-thumb',
};

export const DEFAULT_GAINS: Gains = {
  occupancy: {
    mode: 'density',
    areaPerPerson: OFFICE_DENSITIES.areaPerPerson.value,
    count: 0,
    sensiblePerPerson: OFFICE_DENSITIES.sensiblePerPerson.value,
  },
  lighting: { powerDensity: OFFICE_DENSITIES.lighting.value },
  miscEquipment: { powerDensity: OFFICE_DENSITIES.miscEquipment.value },
  itEquipment: {
    powerDensity: OFFICE_DENSITIES.itEquipment.value,
    // φ. Held at 1 in v1 with no control; the assumption is disclosed instead,
    // because the user cannot change it.
    spaceFraction: 1,
  },
  // The office preset's OWN profiles, not the hand-typed OFFICE_* constants —
  // those stay in schedules.ts for the frozen worked example.
  schedules: presetSchedules(OFFICE_PRESET),
  preset: OFFICE_PRESET.label,
  sourceId: OFFICE_PRESET.id,
};

/**
 * The five surface rows, in the order the UI lists them.
 *
 * Exposed floor starts at zero area and stays visible rather than hidden — a
 * greyed row reading "none" teaches that the category exists, where an absent
 * row teaches nothing.
 *
 * `bufferFactor` is 1 on every row and the UI offers no way to change it: v1
 * has no buffer boundary. A wall to an unheated garage is entered as an outdoor
 * wall, which overstates its loss — the conservative direction.
 */
export function defaultSurfaces(): Surface[] {
  const base = {
    bufferFactor: 1,
    orientation: null,
    shgc: null,
  } as const;
  return [
    { id: 'walls', category: 'wall', label: 'Walls', area: 0, uValue: 0.35, boundary: 'air', ...base },
    { id: 'windows', category: 'window', label: 'Windows', area: 0, uValue: 1.8, boundary: 'air', ...base },
    { id: 'roof', category: 'roof', label: 'Roof', area: 0, uValue: 0.25, boundary: 'air', ...base },
    { id: 'ground-floor', category: 'groundFloor', label: 'Ground floor', area: 0, uValue: 0.3, boundary: 'ground', ...base },
    { id: 'exposed-floor', category: 'exposedFloor', label: 'Exposed floor', area: 0, uValue: 0.25, boundary: 'air', ...base },
  ];
}
