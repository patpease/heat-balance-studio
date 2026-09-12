import { describe, expect, it } from 'vitest';

import { parseDdy } from '../src/climate/ddy';
import { describeLocation, parseEpw } from '../src/climate/epw';
import { deriveDesignDay, withMinimum } from '../src/climate/designDay';

/** A believable EPW: eight header lines, then a year of hourly rows. */
function epw(options: { missingHours?: number[]; malformed?: boolean } = {}): string {
  const header = [
    'LOCATION,Boston Logan Intl Ap,MA,USA,TMYx,725090,42.36,-71.01,-5.0,6.0',
    'DESIGN CONDITIONS,0',
    'TYPICAL/EXTREME PERIODS,0',
    'GROUND TEMPERATURES,0',
    'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0',
    'COMMENTS 1,Synthetic fixture',
    'COMMENTS 2,',
    'DATA PERIODS,1,1,Data,Sunday,1/1,12/31',
  ];

  const rows: string[] = [];
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let dayOfYear = 0;
  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= daysInMonth[month - 1]!; day++) {
      dayOfYear++;
      for (let hour = 1; hour <= 24; hour++) {
        const seasonal = -12 * Math.cos((dayOfYear / 365) * 2 * Math.PI);
        const diurnal = -6 * Math.cos(((hour - 1) / 24) * 2 * Math.PI);
        const index = (dayOfYear - 1) * 24 + hour - 1;
        const tdb = options.missingHours?.includes(index) ? 99.9 : Number((seasonal + diurnal).toFixed(1));
        rows.push(`1990,${month},${day},${hour},60,A,${tdb},0.0,50,101325,0,0,0,0`);
      }
    }
  }
  if (options.malformed) rows.push('1990,1,1');
  return [...header, ...rows].join('\n');
}

const DDY = `
! Boston Logan Intl Ap, synthetic fixture

 SizingPeriod:DesignDay,
  Boston Logan Intl Ap Ann Htg 99.6% Condns DB,     !- Name
       1,      !- Month
      21,      !- Day of Month
  WinterDesignDay,  !- Day Type
   -13.6,      !- Maximum Dry-Bulb Temperature {C}
     0.0,      !- Daily Dry-Bulb Temperature Range {C}
  Wetbulb,     !- Humidity Condition Type
   -13.6,      !- Wetbulb at Maximum Dry-Bulb {C}
  101988.,     !- Barometric Pressure {Pa}
     6.5,      !- Wind Speed {m/s}
     280,      !- Wind Direction {deg}
      No,      !- Rain Indicator
      No,      !- Snow Indicator
      No,      !- Daylight Saving Time Indicator
  ASHRAEClearSky, !- Solar Model Indicator
      0.0;     !- Sky Clearness

 SizingPeriod:DesignDay,
  Boston Logan Intl Ap Ann Htg Wind 99.6% Condns WS=>MCDB,  !- Name
       1,      !- Month
      21,      !- Day of Month
  WinterDesignDay,  !- Day Type
    -2.1,      !- Maximum Dry-Bulb Temperature {C}
     0.0,      !- Daily Dry-Bulb Temperature Range {C}
  Wetbulb,     !- Humidity Condition Type
    -2.1,      !- Wetbulb at Maximum Dry-Bulb {C}
  101988.,     !- Barometric Pressure {Pa}
    15.7,      !- Wind Speed {m/s}
     300,      !- Wind Direction {deg}
      No,      !- Rain Indicator
      No,      !- Snow Indicator
      No,      !- Daylight Saving Time Indicator
  ASHRAEClearSky, !- Solar Model Indicator
      0.0;     !- Sky Clearness

 SizingPeriod:DesignDay,
  Boston Logan Intl Ap Ann Clg .4% Condns DB=>MWB, !- Name
       7,      !- Month
      21,      !- Day of Month
  SummerDesignDay,  !- Day Type
    32.3,      !- Maximum Dry-Bulb Temperature {C}
     8.5,      !- Daily Dry-Bulb Temperature Range {C}
  Wetbulb,     !- Humidity Condition Type
    22.7,      !- Wetbulb at Maximum Dry-Bulb {C}
  101988.,     !- Barometric Pressure {Pa}
     4.9,      !- Wind Speed {m/s}
     230,      !- Wind Direction {deg}
      No,      !- Rain Indicator
      No,      !- Snow Indicator
      No,      !- Daylight Saving Time Indicator
  ASHRAEClearSky, !- Solar Model Indicator
      1.0;     !- Sky Clearness
`;

describe('EPW parsing', () => {
  const file = parseEpw(epw());

  it('reads the location header', () => {
    expect(file.location.city).toBe('Boston Logan Intl Ap');
    expect(file.location.state).toBe('MA');
    expect(file.location.latitude).toBeCloseTo(42.36, 6);
    expect(file.location.elevation).toBeCloseTo(6, 6);
    expect(describeLocation(file.location)).toBe('Boston Logan Intl Ap, MA, USA');
  });

  it('reads a whole year of hourly samples', () => {
    expect(file.samples).toHaveLength(8760);
    expect(file.problems).toHaveLength(0);
  });

  it('maps EPW hour 1–24 onto 0–23 without spilling into the next day', () => {
    // EPW hour 24 is the hour ENDING at midnight. Rolling it into the next day
    // would leave two days incomplete instead of one complete, and the
    // derivation drops any day that is not 24 hours long.
    const firstDay = file.samples.filter((s) => s.dayKey === '01-01');
    expect(firstDay).toHaveLength(24);
    expect(firstDay.map((s) => s.hour).sort((a, b) => a - b)).toEqual([...Array(24).keys()]);
  });

  it('treats 99.9 as the missing marker it is, not as a temperature', () => {
    // A 99.9 °C hour read as real would sit at the top of every percentile and
    // drag the design minimum with it.
    const withGaps = parseEpw(epw({ missingHours: [0, 1, 2] }));
    expect(withGaps.samples).toHaveLength(8757);
    expect(withGaps.droppedRows).toBe(3);
    expect(withGaps.problems[0]).toMatch(/missing-data marker/);
    expect(withGaps.samples.every((s) => s.tdb < 60)).toBe(true);
  });

  it('drops a malformed row and counts it', () => {
    const broken = parseEpw(epw({ malformed: true }));
    expect(broken.droppedRows).toBe(1);
    expect(broken.problems.some((p) => p.includes('could not be read'))).toBe(true);
  });

  it('rejects a file that is not an EPW, and says how to fix it', () => {
    const notEpw = parseEpw('this is not a weather file');
    expect(notEpw.samples).toHaveLength(0);
    expect(notEpw.problems[0]).toMatch(/LOCATION/);
    expect(notEpw.problems[0]).toMatch(/\.zip/);
  });
});

describe('DDY parsing', () => {
  it('finds the annual heating 99.6% dry-bulb condition', () => {
    const { heating } = parseDdy(DDY);
    expect(heating?.dryBulb).toBeCloseTo(-13.6, 6);
    expect(heating?.month).toBe(1);
    expect(heating?.day).toBe(21);
  });

  it('does NOT pick up the wind-speed object', () => {
    // `Ann Htg Wind 99.6% Condns WS=>MCDB` sits in the same file with a
    // maximum dry bulb of −2.1. A looser match reports that as the heating
    // design temperature, which is a bug that shipped once on the sibling.
    const { heating } = parseDdy(DDY);
    expect(heating?.dryBulb).not.toBeCloseTo(-2.1, 1);
    expect(heating?.name).not.toMatch(/wind/i);
  });

  it('does not pick up a cooling condition either', () => {
    const { heating } = parseDdy(DDY);
    expect(heating?.dryBulb).toBeLessThan(0);
  });

  it('reads the MAXIMUM dry bulb, which is the heating condition here', () => {
    // Reads wrong and is right: the ASHRAE heating design day is isothermal,
    // so its maximum and minimum are the same number.
    expect(parseDdy(DDY).heating?.dryBulb).toBeCloseTo(-13.6, 6);
  });

  it('says so when there is no heating condition', () => {
    const coolingOnly = DDY.split('SizingPeriod:DesignDay').slice(0, 1).join('') +
      'SizingPeriod:DesignDay' + DDY.split('SizingPeriod:DesignDay')[3];
    const { heating, problems } = parseDdy(coolingOnly);
    expect(heating).toBeNull();
    expect(problems[0]).toMatch(/no annual heating/i);
  });

  it('says so when the file has no design days at all', () => {
    expect(parseDdy('! nothing here').problems[0]).toMatch(/No design days/);
  });
});

describe('the DDY supplies the level and the EPW supplies the shape', () => {
  const file = parseEpw(epw());
  const { designDay: derived } = deriveDesignDay(file.samples, { sourceLabel: 'EPW' });
  const published = parseDdy(DDY).heating!;
  const combined = withMinimum(derived, published.dryBulb, 'ASHRAE 99.6% from the .ddy');

  it('takes the published minimum exactly', () => {
    expect(combined.minimum).toBeCloseTo(-13.6, 10);
    expect(Math.min(...combined.hours.map((h) => h.tdb))).toBeCloseTo(-13.6, 10);
  });

  it('keeps the derived diurnal range rather than the DDY’s flat day', () => {
    // The ASHRAE heating design day has a daily range of ZERO. Using it as
    // drawn would make every building fail by more, and for the wrong reason:
    // a flat day at the design minimum is colder for 23 hours than any real
    // day ever is.
    expect(published.dryBulb).toBeDefined();
    const range = Math.max(...combined.hours.map((h) => h.tdb)) - Math.min(...combined.hours.map((h) => h.tdb));
    expect(range).toBeCloseTo(derived.dailyRange, 10);
    expect(range).toBeGreaterThan(1);
  });

  it('shifts every hour by the same amount, preserving the curve', () => {
    const shift = combined.hours[0]!.tdb - derived.hours[0]!.tdb;
    for (let h = 0; h < 24; h++) {
      expect(combined.hours[h]!.tdb - derived.hours[h]!.tdb).toBeCloseTo(shift, 9);
    }
  });

  it('says in the provenance where each half came from', () => {
    expect(combined.provenance).toMatch(/ddy/i);
    expect(combined.basis).toBe('manual');
  });
});
