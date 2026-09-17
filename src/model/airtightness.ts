/**
 * Envelope air leakage, as three named grades.
 *
 * Infiltration is uncontrolled outdoor air coming in through cracks, and on a
 * cold design day it is heat leaving. It belongs in this tool for the reason
 * the assumption list already gave: it is the largest single omission, and the
 * reason a passing result had to be called optimistic.
 *
 * ## Why a grade and not a number
 *
 * Nobody knows their building's leakage at concept stage — it has not been
 * built, let alone blower-door tested. What a designer does know is what they
 * are specifying: a continuous air barrier, or not. So the input is a choice
 * between three grades, each anchored to a published requirement rather than
 * to a guess, and each one a sentence a designer can agree or disagree with.
 *
 * ## The metric
 *
 * `cfm75` is cfm/ft² of above-grade envelope at 75 Pa — the quantity codes
 * write requirements in and blower-door tests measure. The three grades span
 * more than twenty to one, which is itself the point worth showing.
 */

export type Airtightness = 'leaky' | 'typical' | 'tight';

export interface AirtightnessGrade {
  readonly id: Airtightness;
  readonly label: string;
  /** cfm/ft² of above-grade envelope area at 75 Pa. */
  readonly cfm75: number;
  readonly citation: string;
  readonly note: string;
}

export const AIRTIGHTNESS: readonly AirtightnessGrade[] = Object.freeze([
  {
    id: 'leaky',
    label: 'Leaky',
    cfm75: 1.8,
    citation: 'ASHRAE 90.1-2004 baseline; PNNL-18898 uses it as its modelling baseline',
    note: 'No continuous air barrier. What most construction did before air barriers were required, and what an existing building is likely to test at.',
  },
  {
    id: 'typical',
    label: 'Typical',
    cfm75: 0.4,
    citation: 'ASHRAE 90.1-2010 onward and the IECC, continuous air barrier',
    note: 'A continuous air barrier, specified and detailed to current code. The default, because it is what a new building is required to do.',
  },
  {
    id: 'tight',
    label: 'Tight',
    cfm75: 0.08,
    citation: 'Passive House',
    note: 'Tested and sealed to the Passive House target. Achievable, and it takes deliberate detailing and a test to prove.',
  },
]);

export function grade(id: Airtightness): AirtightnessGrade {
  return AIRTIGHTNESS.find((g) => g.id === id) ?? AIRTIGHTNESS[1]!;
}

/**
 * What the envelope actually leaks, and where the number came from.
 *
 * The same contract the gain presets follow: `grade` answers "is this still a
 * published figure?" and goes null the moment someone types over it, while
 * `leakage` is the number the engine uses either way. A grade badge that
 * outlived the number it described would be attributing a user's figure to
 * ASHRAE.
 *
 * Someone who has a blower-door result, or a specification, should be able to
 * enter it — a picker alone would make this tool useless to the one user who
 * actually knows the answer.
 */
export interface AirLeakage {
  /** m³/(s·m²) of above-grade envelope at 75 Pa. Canonical SI. */
  readonly leakage: number;
  /** The grade it came from, or null once entered by hand. */
  readonly grade: Airtightness | null;
}

/** A grade as a stored setting. */
export function leakageOf(id: Airtightness): AirLeakage {
  return { leakage: grade(id).cfm75 * M3S_M2_PER_CFM_FT2, grade: id };
}

/** Which grade a rate corresponds to, or null if it matches none of them. */
export function gradeMatching(leakage: number): Airtightness | null {
  const match = AIRTIGHTNESS.find(
    (g) => Math.abs(g.cfm75 * M3S_M2_PER_CFM_FT2 - leakage) < 5e-7,
  );
  return match ? match.id : null;
}

/**
 * 75 Pa test rate → the rate the building actually leaks at.
 *
 * A blower door holds the building at 75 Pa. Weather does not: real pressure
 * differences are a few pascals, and the flow falls off with them. PNNL-18898
 * converts with a single factor rather than a pressure exponent, and this is
 * that factor — the same one behind the DOE prototype models, which is worth
 * more here than a more elaborate correlation the tool cannot calibrate.
 *
 * Gowri, Winiarski and Jarnagin, *Infiltration Modeling Guidelines for
 * Commercial Building Energy Analysis*, PNNL-18898, September 2009.
 */
export const DESIGN_PRESSURE_FACTOR = 0.112;

/**
 * 1 cfm/ft² = 0.005080 m³/s per m².
 *
 * Written out of its parts rather than as the product, because the product is
 * where this went wrong the first time: 1 cfm is 4.72e-4 m³/s and it was typed
 * as 4.72e-3, which is a tenfold error that lands in the middle of a plausible
 * range and would have looked like nothing.
 */
export const CUBIC_METRES_PER_SECOND_PER_CFM = 0.0283168466 / 60;
export const SQUARE_METRES_PER_SQUARE_FOOT = 0.09290304;
export const M3S_M2_PER_CFM_FT2 =
  CUBIC_METRES_PER_SECOND_PER_CFM / SQUARE_METRES_PER_SQUARE_FOOT;

/**
 * Volumetric heat capacity of air at sea level, J/m³K.
 *
 * ρ·c_p, the two always appearing together. 1.2 kg/m³ × 1006 J/kgK — the same
 * constant a load calculation writes as 1.08 Btu/h per cfm per °F.
 */
export const AIR_HEAT_CAPACITY_SEA_LEVEL = 1.2 * 1006;

/**
 * How much thinner the air is up there.
 *
 * The standard-atmosphere pressure ratio, and the reason it is here: Denver
 * sits at 1,600 m where the standard atmosphere is 0.824 of sea-level pressure,
 * so a Denver building loses 18% less heat per unit of leakage than the same
 * building in Boston. The geocoder
 * already returns elevation, so declining to use it would be a choice.
 *
 * Density rather than temperature: ρ·c_p is held constant so the term stays a
 * conductance, which is what lets it join the others as one more labelled term
 * instead of becoming a special case in the solver.
 */
export function pressureRatio(elevationMetres: number): number {
  const z = Math.max(0, elevationMetres);
  return (1 - 2.25577e-5 * z) ** 5.25588;
}

/** ρ·c_p at a site, J/m³K. */
export function airHeatCapacity(elevationMetres: number): number {
  return AIR_HEAT_CAPACITY_SEA_LEVEL * pressureRatio(elevationMetres);
}
