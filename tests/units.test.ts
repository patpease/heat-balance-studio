import { describe, expect, it } from 'vitest';

import {
  deltaFromF,
  deltaToF,
  fromBtuU,
  fromF,
  fromSqFt,
  fromWattsPerSqFt,
  rToU,
  toBtuHFt2,
  toBtuU,
  toF,
  toSqFt,
  toWattsPerSqFt,
  uToR,
} from '../src/model/units';

/**
 * The U ⇄ R field is the one conversion in this tool that fails SILENTLY.
 *
 * It is a reciprocal, so a mistake does not produce an obviously wrong
 * magnitude — it produces a plausible number pointing the wrong way, and an
 * R-13 wall quietly becomes an R-0.077 one. Both directions, both systems.
 */

describe('U ⇄ R round-trips in both unit systems', () => {
  const uValues = [0.05, 0.15, 0.2, 1.2, 1.8, 5.7];

  it.each(uValues)('SI: U %s survives a round trip', (u) => {
    expect(rToU(uToR(u, 'SI'), 'SI')).toBeCloseTo(u, 12);
  });

  it.each(uValues)('IP: U %s survives a round trip', (u) => {
    expect(rToU(uToR(u, 'IP'), 'IP')).toBeCloseTo(u, 12);
  });

  it('gives the familiar IP numbers for a familiar assembly', () => {
    // R-13 in IP is h·ft²·°F/Btu. That is U 0.0769 IP, which is 0.437 W/m²K.
    const u = rToU(13, 'IP');
    expect(u).toBeCloseTo(0.4368, 3);
    expect(toBtuU(u)).toBeCloseTo(1 / 13, 10);
    expect(uToR(u, 'IP')).toBeCloseTo(13, 10);
  });

  it('gives the familiar SI numbers for a familiar assembly', () => {
    // A 0.20 W/m²K wall is R 5.0 m²K/W — and R 28.4 in IP, not R 5.
    expect(uToR(0.2, 'SI')).toBeCloseTo(5, 10);
    expect(uToR(0.2, 'IP')).toBeCloseTo(28.39, 2);
  });

  it('refuses a zero or negative U rather than returning Infinity', () => {
    // Infinity in a text field is a bug that reaches the user. A zero U-value
    // is an input error the field should have caught.
    expect(() => uToR(0, 'SI')).toThrow(RangeError);
    expect(() => uToR(-1, 'IP')).toThrow(RangeError);
    expect(() => rToU(0, 'SI')).toThrow(RangeError);
    expect(() => rToU(Number.NaN, 'SI')).toThrow(RangeError);
  });

  it('always returns canonical SI from rToU, whatever was typed', () => {
    // The same physical assembly entered either way must store the same number.
    const fromIp = rToU(28.3919, 'IP');
    const fromSi = rToU(5, 'SI');
    expect(fromIp).toBeCloseTo(fromSi, 4);
  });
});

describe('a temperature and a temperature DIFFERENCE convert differently', () => {
  it('converts an absolute temperature with the offset', () => {
    expect(toF(0)).toBe(32);
    expect(toF(10)).toBe(50);
    expect(toF(21.11111111111111)).toBeCloseTo(70, 9);
    expect(fromF(70)).toBeCloseTo(21.1111, 4);
  });

  it('converts a difference without it', () => {
    // A 10 K rise is an 18 °F rise, not a 50 °F one. A sibling shipped a design
    // check that compared a Fahrenheit delta against a Celsius limit and stayed
    // silent on exactly the designs it existed to catch.
    expect(deltaToF(10)).toBe(18);
    expect(deltaToF(1)).toBeCloseTo(1.8, 12);
    expect(deltaFromF(18)).toBeCloseTo(10, 12);
  });

  it('never lets the two agree, which is the whole point', () => {
    expect(deltaToF(10)).not.toBe(toF(10));
  });
});

describe('heat flux versus power density', () => {
  it('renders a heat flux in Btu/h·ft²', () => {
    expect(toBtuHFt2(10)).toBeCloseTo(3.17, 2);
    expect(toBtuHFt2(14.386)).toBeCloseTo(4.56, 2);
  });

  it('renders an installed density in W/ft², not Btu/h·ft²', () => {
    // The same SI number has two different IP renderings depending on whether
    // it is a flux or a density. 6.5 W/m² of lighting is 0.60 W/ft², and
    // calling it 2.06 Btu/h·ft² would be correct arithmetic and the wrong unit
    // for the field.
    expect(toWattsPerSqFt(6.5)).toBeCloseTo(0.604, 3);
    expect(toWattsPerSqFt(7.0)).toBeCloseTo(0.650, 3);
    expect(toWattsPerSqFt(1.0)).toBeCloseTo(0.0929, 4);
    expect(toBtuHFt2(6.5)).not.toBeCloseTo(toWattsPerSqFt(6.5), 2);
  });

  it('round-trips a density', () => {
    expect(fromWattsPerSqFt(toWattsPerSqFt(6.5))).toBeCloseTo(6.5, 12);
  });
});

describe('area', () => {
  it('matches the worked example figures', () => {
    expect(toSqFt(500)).toBeCloseTo(5382, 0);
    expect(toSqFt(220.5)).toBeCloseTo(2373, 0);
    expect(toSqFt(94.5)).toBeCloseTo(1017, 0);
  });

  it('round-trips', () => {
    expect(fromSqFt(toSqFt(500))).toBeCloseTo(500, 9);
  });

  it('converts an occupancy density to the familiar 200 ft²/person', () => {
    expect(toSqFt(18.6)).toBeCloseTo(200, 0);
  });
});

describe('the IP U-value conversion', () => {
  it('round-trips', () => {
    expect(fromBtuU(toBtuU(0.2))).toBeCloseTo(0.2, 12);
  });

  it('matches the worked example figures shown in the wireframe', () => {
    expect(toBtuU(0.2)).toBeCloseTo(0.035, 3);
    expect(toBtuU(1.2)).toBeCloseTo(0.211, 3);
    expect(toBtuU(0.15)).toBeCloseTo(0.026, 3);
    expect(toBtuU(0.18)).toBeCloseTo(0.032, 3);
  });
});
