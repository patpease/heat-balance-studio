/**
 * Starting values.
 *
 * **Every density here is provisional.** They are representative of ASHRAE
 * 90.1-era office assumptions but have not been checked against the published
 * tables, and this tool's rule is that a number badged with a standard's name
 * must carry its citation. So the preset is called "Office (provisional)" and
 * `citation` says so on every row — the field help text renders it, and the
 * name changes only when the sourced data arrives.
 *
 * IT equipment ships at ZERO rather than at a plausible-looking number. 90.1
 * does not break receptacle load into IT and misc, and real values span three
 * orders of magnitude — an IDF closet is a fraction of a W/m² of building area,
 * a data hall is hundreds of W/m² of white space. A single shipped default
 * would look authoritative and be wrong most of the time.
 */

import {
  ALWAYS_ON,
  OFFICE_LIGHTING,
  OFFICE_MISC_EQUIPMENT,
  OFFICE_OCCUPANCY,
} from './schedules';
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

export const OFFICE_DENSITIES = {
  /** m² per person. */
  areaPerPerson: {
    value: 18.6,
    citation: 'Provisional — pending sourcing against ASHRAE 90.1 App. G',
  },
  /** W per person, sensible only. */
  sensiblePerPerson: {
    value: 75,
    citation: 'Provisional — pending sourcing against ASHRAE Fundamentals Ch. 18',
  },
  /** W/m². */
  lighting: {
    value: 6.5,
    citation: 'Provisional — pending sourcing against ASHRAE 90.1 Table 9.5.1',
  },
  /** W/m². */
  miscEquipment: {
    value: 7.0,
    citation: 'Provisional — pending sourcing against ASHRAE 90.1 App. G',
  },
  /** W/m². Zero by design: see the note at the top of this file. */
  itEquipment: {
    value: 0,
    citation: 'No published default exists — pick an IT space type or enter a value',
  },
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
  schedules: {
    occupancy: OFFICE_OCCUPANCY,
    lighting: OFFICE_LIGHTING,
    miscEquipment: OFFICE_MISC_EQUIPMENT,
    itEquipment: ALWAYS_ON,
  },
  preset: 'Office (provisional)',
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
