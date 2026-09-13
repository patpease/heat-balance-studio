/**
 * Unit conversion.
 *
 * **Storage is canonical SI. IP is a display transform and never a storage
 * format.** Everything the engine touches is watts, kelvin, square metres,
 * W/m²K and degrees Celsius; conversion happens once, at the edge, on the way
 * to a screen or a file.
 *
 * The trap this module exists to contain is the **U ⇄ R field**. The conversion
 * is a reciprocal, so a mistake there is not a scale error that looks obviously
 * wrong — it produces a plausible number pointing the wrong way, and an
 * R-13 wall quietly becomes an R-0.077 one. Both directions are tested.
 *
 * A second trap, inherited from a sibling: **a temperature and a temperature
 * DIFFERENCE do not convert the same way.** 10 °C is 50 °F, but a 10 K rise is
 * an 18 °F rise. `toF` and `deltaToF` are deliberately separate functions and
 * neither is a default.
 */

import type { UnitSystem } from './types';

// --- Exact-by-definition factors -------------------------------------------

/** 1 W = 3.412141633… Btu/h. */
export const BTU_H_PER_WATT = 3.412141633;
/** 1 ft = 0.3048 m, exactly, by international agreement since 1959. */
export const M_PER_FT = 0.3048;
/** 1 m² = 10.7639104 ft². */
export const SQFT_PER_SQM = 10.7639104;
/** 1 W/m² = 0.3169983… Btu/h·ft². */
export const BTU_H_FT2_PER_W_M2 = BTU_H_PER_WATT / SQFT_PER_SQM;
/** 1 W/m²K = 0.1761102… Btu/h·ft²·°F. The 1.8 is K per °F. */
export const BTU_U_PER_SI_U = BTU_H_FT2_PER_W_M2 / 1.8;

// --- Temperature -----------------------------------------------------------

/** An absolute temperature: °C → °F. */
export function toF(celsius: number): number {
  return celsius * 9 / 5 + 32;
}

/** An absolute temperature: °F → °C. */
export function fromF(fahrenheit: number): number {
  return (fahrenheit - 32) * 5 / 9;
}

/**
 * A temperature DIFFERENCE: K → °F-degrees. No offset.
 *
 * Never reach for `toF` here. A sibling shipped a design check that compared a
 * Fahrenheit delta against a Celsius limit, and it stayed silent on exactly the
 * designs it existed to catch.
 */
export function deltaToF(kelvin: number): number {
  return kelvin * 9 / 5;
}

/** A temperature DIFFERENCE: °F-degrees → K. */
export function deltaFromF(fahrenheitDegrees: number): number {
  return fahrenheitDegrees * 5 / 9;
}

// --- Power, area, intensity ------------------------------------------------

/** W → Btu/h. */
export function toBtuH(watts: number): number {
  return watts * BTU_H_PER_WATT;
}

/**
 * m → ft. A DIMENSION, not an area.
 *
 * The sketch box is the only place in the tool where a plain length reaches a
 * text field, and shipping without this is what let that box show 25 metres,
 * unlabelled, to a user reading feet.
 */
export function toFt(metres: number): number {
  return metres / M_PER_FT;
}

/** ft → m. */
export function fromFt(feet: number): number {
  return feet * M_PER_FT;
}

/** m² → ft². */
export function toSqFt(squareMetres: number): number {
  return squareMetres * SQFT_PER_SQM;
}

/** ft² → m². */
export function fromSqFt(squareFeet: number): number {
  return squareFeet / SQFT_PER_SQM;
}

/** W/m² → Btu/h·ft². Heat FLUX, which is what the chart plots under IP. */
export function toBtuHFt2(wattsPerSqM: number): number {
  return wattsPerSqM * BTU_H_FT2_PER_W_M2;
}

/**
 * W/m² → W/ft².
 *
 * Power DENSITY is the odd one out: lighting and equipment are quoted in W/ft²
 * under IP, not Btu/h·ft². The same SI number therefore has two different IP
 * renderings depending on whether it is a heat flux or an installed density,
 * which is why they are separate functions rather than one `toIP`.
 */
export function toWattsPerSqFt(wattsPerSqM: number): number {
  return wattsPerSqM / SQFT_PER_SQM;
}

/** W/ft² → W/m². */
export function fromWattsPerSqFt(wattsPerSqFt: number): number {
  return wattsPerSqFt * SQFT_PER_SQM;
}

// --- Conductance and resistance --------------------------------------------

/** U in W/m²K → U in Btu/h·ft²·°F. */
export function toBtuU(siU: number): number {
  return siU * BTU_U_PER_SI_U;
}

/** U in Btu/h·ft²·°F → U in W/m²K. */
export function fromBtuU(ipU: number): number {
  return ipU / BTU_U_PER_SI_U;
}

/**
 * U ⇄ R, in whichever system the caller is displaying.
 *
 * A U of zero has no finite R and vice versa. Rather than return Infinity and
 * let it reach a text field, both throw — a zero U-value is an input error the
 * field should have caught, not a number to render.
 */
export function uToR(u: number, units: UnitSystem): number {
  if (!Number.isFinite(u) || u <= 0) {
    throw new RangeError(`U-value must be a positive finite number, got ${u}`);
  }
  return units === 'SI' ? 1 / u : 1 / toBtuU(u);
}

/** R → U, returning canonical SI W/m²K regardless of the input system. */
export function rToU(r: number, units: UnitSystem): number {
  if (!Number.isFinite(r) || r <= 0) {
    throw new RangeError(`R-value must be a positive finite number, got ${r}`);
  }
  return units === 'SI' ? 1 / r : fromBtuU(1 / r);
}

// --- Labels ----------------------------------------------------------------

export interface UnitLabels {
  temperature: string;
  length: string;
  temperatureDelta: string;
  area: string;
  heatFlow: string;
  heatFlux: string;
  powerDensity: string;
  uValue: string;
  rValue: string;
  areaPerPerson: string;
  perPersonHeat: string;
}

export const LABELS: Record<UnitSystem, UnitLabels> = {
  IP: {
    temperature: '°F',
    temperatureDelta: '°F',
    length: 'ft',
    area: 'ft²',
    heatFlow: 'Btu/h',
    heatFlux: 'Btu/h·ft²',
    powerDensity: 'W/ft²',
    uValue: 'Btu/h·ft²·°F',
    rValue: 'h·ft²·°F/Btu',
    areaPerPerson: 'ft²/person',
    perPersonHeat: 'Btu/h',
  },
  SI: {
    temperature: '°C',
    temperatureDelta: 'K',
    length: 'm',
    area: 'm²',
    heatFlow: 'W',
    heatFlux: 'W/m²',
    powerDensity: 'W/m²',
    uValue: 'W/m²K',
    rValue: 'm²K/W',
    areaPerPerson: 'm²/person',
    perPersonHeat: 'W',
  },
};
