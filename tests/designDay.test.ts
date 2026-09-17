import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { deriveDesignDay, median, percentileOf, withMinimum } from '../src/climate/designDay';
import type { HourSample } from '../src/climate/designDay';
import {
  archiveUrl,
  geocodeUrl,
  isAllowedHost,
  matchesFromGeocode,
  samplesFromArchive,
  standardOffsetSeconds,
  WeatherDataError,
} from '../src/climate/openMeteo';
import { BOSTON_PROFILE_C } from './fixtures/boston-office';

/**
 * The derivation, against the real Boston record.
 *
 * `boston-2015-2024.i16` is 87,672 hourly values — ten whole calendar years of
 * ERA5 for 42.36 N, 71.06 W, in LOCAL STANDARD TIME — packed as temperature ×
 * 100 in Int16, which round-trips exactly at the API's own precision. It is
 * committed so this phase needs no live call to be verified.
 */
function bostonSamples(): HourSample[] {
  const raw = readFileSync(resolve(import.meta.dirname, 'fixtures/boston-2015-2024.i16'));
  const values = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);

  // The record starts at 2015-01-01T00:00 local standard and runs unbroken, so
  // the day index is the sample index over 24. No date parsing needed here —
  // and none wanted, since a parse would reintroduce the DST question the
  // fixture was built to settle.
  //
  // The MONTH is arithmetic on a fixed epoch rather than a parse: hour i is i
  // hours after 2015-01-01 local standard, and local standard time has no
  // discontinuities to trip over. It is computed in UTC precisely so that no
  // offset is applied to it twice.
  const epoch = Date.UTC(2015, 0, 1);
  const samples: HourSample[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    samples[i] = {
      dayKey: String(Math.floor(i / 24)),
      month: new Date(epoch + i * 3_600_000).getUTCMonth() + 1,
      hour: i % 24,
      tdb: values[i]! / 100,
    };
  }
  return samples;
}

const samples = bostonSamples();
const { designDay, diagnostics } = deriveDesignDay(samples, {
  yearsOfRecord: [2015, 2024],
});

describe('the fixture itself', () => {
  it('is ten whole years of hourly data with no gaps', () => {
    expect(samples).toHaveLength(87672);
    expect(samples.length / 24).toBe(3653); // 3,650 + three leap days
  });
});

describe('the Boston design day reproduces the published derivation', () => {
  it('takes the 99.6% minimum over all 87,672 hours', () => {
    expect(designDay.minimum).toBeCloseTo(-15.3, 2);
    expect(designDay.percentile).toBe(0.4);
    expect(diagnostics.hoursRead).toBe(87672);
  });

  it('selects 80 cold days and takes a median range of 11.7 K', () => {
    expect(diagnostics.coldDaysSelected).toBe(80);
    expect(designDay.dailyRange).toBeCloseTo(11.7, 1);
  });

  /**
   * February, not January — and that is the point of using the cold days
   * rather than the coldest hour. The ground temperature follows where the
   * cold weather lives.
   */
  it('puts the design day in February, where most of the cold days are', () => {
    expect(designDay.designMonth).toBe(2);
  });

  it('reports a February mean of −0.6 °C, not the 10.9 °C annual mean', () => {
    expect(designDay.designMonthMeanTemperature).toBeCloseTo(-0.6, 1);
  });

  it('rebuilds the committed 24-hour profile', () => {
    expect(designDay.hours).toHaveLength(24);
    designDay.hours.forEach((h, i) => {
      expect(h.hour).toBe(i);
      expect(h.tdb).toBeCloseTo(BOSTON_PROFILE_C[i]!, 1);
    });
  });

  it('anchors the coldest hour exactly at the design minimum', () => {
    const coldest = Math.min(...designDay.hours.map((h) => h.tdb));
    expect(coldest).toBeCloseTo(designDay.minimum, 10);
  });

  it('spans exactly the median daily range', () => {
    const temps = designDay.hours.map((h) => h.tdb);
    expect(Math.max(...temps) - Math.min(...temps)).toBeCloseTo(designDay.dailyRange, 10);
  });

  it('puts the minimum before dawn and the maximum in the afternoon', () => {
    const temps = designDay.hours.map((h) => h.tdb);
    expect(temps.indexOf(Math.min(...temps))).toBe(6);
    expect(temps.indexOf(Math.max(...temps))).toBe(15);
  });

  it('never claims to be an ASHRAE value', () => {
    expect(designDay.basis).toBe('era5-percentile');
    expect(designDay.provenance).toBe('ERA5 via Open-Meteo, coldest 0.4% of hours, 2015–2024');
    expect(designDay.provenance).not.toMatch(/ASHRAE/i);
  });

  it('reserves the irradiance fields for v3 rather than inventing them', () => {
    for (const h of designDay.hours) {
      expect(h.ghi).toBeNull();
      expect(h.dni).toBeNull();
      expect(h.dhi).toBeNull();
    }
  });
});

describe('the 99% condition is milder, by about the published spread', () => {
  it('gives −12.3 °C at the 1.0 percentile', () => {
    const milder = deriveDesignDay(samples, { percentile: 1.0 });
    expect(milder.designDay.minimum).toBeCloseTo(-12.3, 1);
    expect(milder.designDay.minimum).toBeGreaterThan(designDay.minimum);
  });
});

describe('derivation edge cases', () => {
  const flatDay = (dayKey: string, tdb: number, month = 1): HourSample[] =>
    Array.from({ length: 24 }, (_, hour) => ({ dayKey, month, hour, tdb }));

  it('drops a day that is not 24 hours long rather than distorting it', () => {
    const partial: HourSample[] = [
      ...flatDay('full', -10),
      { dayKey: 'partial', month: 1, hour: 0, tdb: -40 },
    ];
    const { diagnostics: d } = deriveDesignDay(partial);
    expect(d.wholeDays).toBe(1);
  });

  it('falls back to a flat day rather than throwing when nothing is cold enough', () => {
    // Pathological input — a partial upload, say. A flat day at the right level
    // is still usable; an exception is not.
    const single = flatDay('one', 5);
    const { designDay: flat } = deriveDesignDay(single);
    expect(flat.dailyRange).toBe(0);
    expect(flat.hours.every((h) => h.tdb === flat.minimum)).toBe(true);
  });

  it('excludes flat overcast days from the SHAPE but still counts their range', () => {
    // Dividing by a near-zero range amplifies noise, so a day flatter than
    // 0.5 K contributes to the level and not to the curve.
    const shaped: HourSample[] = [
      ...Array.from({ length: 24 }, (_, hour) => ({ dayKey: 'shaped', month: 1, hour, tdb: -20 + hour * 0.5 })),
      ...flatDay('flat', -20),
    ];
    const { diagnostics: d } = deriveDesignDay(shaped);
    expect(d.coldDaysSelected).toBe(2);
    expect(d.coldDaysUsedForShape).toBe(1);
  });

  it('refuses an empty series', () => {
    expect(() => deriveDesignDay([])).toThrow(RangeError);
  });
});

describe('helpers', () => {
  it('takes a percentile by position in the sorted sample', () => {
    const sorted = Array.from({ length: 1000 }, (_, i) => i);
    expect(percentileOf(sorted, 0.4)).toBe(3);
    expect(percentileOf(sorted, 50)).toBe(499);
  });

  it('takes a median that averages the middle pair on an even count', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('substituting a published minimum keeps the derived shape', () => {
  it('shifts the whole profile and relabels the basis', () => {
    // The route for anyone holding the real ASHRAE figure: ERA5 is good at the
    // shape, a station is better at the level.
    const published = withMinimum(designDay, -13.6, 'ASHRAE 99.6%, Boston Logan');
    expect(published.minimum).toBeCloseTo(-13.6, 10);
    expect(published.basis).toBe('manual');

    const range = Math.max(...published.hours.map((h) => h.tdb)) - Math.min(...published.hours.map((h) => h.tdb));
    expect(range).toBeCloseTo(designDay.dailyRange, 10);

    published.hours.forEach((h, i) => {
      expect(h.tdb - designDay.hours[i]!.tdb).toBeCloseTo(1.7, 6);
    });
  });
});

describe('the clock correction', () => {
  it('returns the STANDARD offset, never the daylight one', () => {
    // Verified against the API: a January range requested in September comes
    // back labelled GMT−4. Deriving the offset from the zone instead makes the
    // result independent of when the tool is used.
    expect(standardOffsetSeconds('America/New_York')).toBe(-18000); // EST, not EDT
    expect(standardOffsetSeconds('America/Chicago')).toBe(-21600);
    expect(standardOffsetSeconds('America/Denver')).toBe(-25200);
    expect(standardOffsetSeconds('America/Los_Angeles')).toBe(-28800);
  });

  it('handles a zone that does not observe DST', () => {
    expect(standardOffsetSeconds('America/Phoenix')).toBe(-25200);
    expect(standardOffsetSeconds('Pacific/Honolulu')).toBe(-36000);
  });

  it('takes the non-DST half in the southern hemisphere too', () => {
    // Sydney is +11 in January (AEDT) and +10 in July (AEST); standard is +10.
    expect(standardOffsetSeconds('Australia/Sydney')).toBe(36000);
  });

  it('is UTC for UTC', () => {
    expect(standardOffsetSeconds('UTC')).toBe(0);
  });
});

describe('archive responses', () => {
  const response = {
    hourly: {
      time: ['2024-01-01T05:00', '2024-01-01T06:00', '2024-01-01T07:00'],
      temperature_2m: [-5, -6, -7],
    },
  };

  it('shifts UTC stamps into local standard time', () => {
    const { samples: s } = samplesFromArchive(response, -18000);
    // 05:00Z is midnight EST.
    expect(s[0]).toEqual({ dayKey: '2024-01-01', month: 1, hour: 0, tdb: -5 });
    expect(s[1]!.hour).toBe(1);
    expect(s[2]!.hour).toBe(2);
  });

  it('rolls the day key back when the shift crosses midnight', () => {
    const { samples: s } = samplesFromArchive(
      { hourly: { time: ['2024-01-01T00:00'], temperature_2m: [-5] } },
      -18000,
    );
    expect(s[0]!.dayKey).toBe('2023-12-31');
    expect(s[0]!.hour).toBe(19);
  });

  it('drops and counts nulls rather than interpolating them', () => {
    const { samples: s, dropped } = samplesFromArchive(
      { hourly: { time: ['2024-01-01T05:00', '2024-01-01T06:00'], temperature_2m: [null, -6] } },
      -18000,
    );
    expect(s).toHaveLength(1);
    expect(dropped).toBe(1);
  });

  it('rejects a malformed response with a message a person can act on', () => {
    expect(() => samplesFromArchive({}, 0)).toThrow(WeatherDataError);
    expect(() => samplesFromArchive({ hourly: { time: ['a'], temperature_2m: [1, 2] } }, 0))
      .toThrow(/mismatched/);
    expect(() => samplesFromArchive({ hourly: { time: [], temperature_2m: [] } }, 0))
      .toThrow(/empty/);
  });
});

describe('request building', () => {
  it('asks the archive for UTC, which is the whole point', () => {
    const url = archiveUrl({ latitude: 42.3601, longitude: -71.0589, startDate: '2015-01-01', endDate: '2024-12-31' });
    expect(url).toContain('timezone=UTC');
    expect(url).toContain('temperature_unit=celsius');
    expect(url).toContain('hourly=temperature_2m');
  });

  it('restricts geocoding to the United States in v1', () => {
    expect(geocodeUrl('Boston, Massachusetts')).toContain('country=US');
  });

  it('pins hosts exactly, so a suffix cannot impersonate one', () => {
    expect(isAllowedHost('archive-api.open-meteo.com')).toBe(true);
    expect(isAllowedHost('ARCHIVE-API.OPEN-METEO.COM')).toBe(true);
    expect(isAllowedHost('archive-api.open-meteo.com.example.com')).toBe(false);
    expect(isAllowedHost('evil-open-meteo.com')).toBe(false);
  });
});

describe('geocode results', () => {
  it('keeps the order the service returned and labels each with its state', () => {
    const matches = matchesFromGeocode({
      results: [
        { name: 'Boston', admin1: 'Massachusetts', latitude: 42.35, longitude: -71.06, elevation: 14, timezone: 'America/New_York' },
        { name: 'Pittsfield', admin1: 'Massachusetts', latitude: 42.45, longitude: -73.25, elevation: 306, timezone: 'America/New_York' },
      ],
    });
    // Both are surfaced. The fuzzy second result is exactly why the UI must
    // show what it matched rather than take the first silently.
    expect(matches).toHaveLength(2);
    expect(matches[0]!.label).toBe('Boston, Massachusetts');
    expect(matches[1]!.label).toBe('Pittsfield, Massachusetts');
  });

  it('skips entries missing coordinates instead of inventing them', () => {
    expect(matchesFromGeocode({ results: [{ name: 'Nowhere' }] })).toHaveLength(0);
  });

  it('returns nothing for an empty or malformed response', () => {
    expect(matchesFromGeocode({})).toEqual([]);
    expect(matchesFromGeocode(null)).toEqual([]);
  });
});
