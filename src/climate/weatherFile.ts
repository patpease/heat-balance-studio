/**
 * Reading a dropped weather file.
 *
 * Everything here happens in the browser. **Nothing is uploaded** — the file is
 * parsed on the machine it was dropped on and never leaves it, which is the
 * same promise the rest of the tool makes and the reason this path works with
 * the relay down.
 *
 * It is also the offline route in the fallback ladder: EPW beats the derived
 * archive, and a DDY beats everything for the *level*.
 */

import { strFromU8, unzipSync } from 'fflate';

import { deriveDesignDay, withMinimum } from './designDay';
import { describeLocation, parseEpw } from './epw';
import type { EpwLocation } from './epw';
import { parseDdy } from './ddy';
import type { DesignDay, Site } from '../model/types';

export interface WeatherFileResult {
  readonly designDay: DesignDay;
  readonly site: Site;
  readonly problems: readonly string[];
  /** What the file actually contributed, for the panel to say out loud. */
  readonly summary: string;
}

export type WeatherFileOutcome =
  | { readonly ok: true; readonly value: WeatherFileResult }
  | { readonly ok: false; readonly message: string };

function siteFrom(location: EpwLocation): Site {
  return {
    label: describeLocation(location),
    latitude: location.latitude,
    longitude: location.longitude,
    elevation: location.elevation,
    // An EPW states its UTC offset as a number and it is already standard time,
    // so there is no IANA zone to carry and none is needed — the file's hours
    // are the clock this tool wants.
    timezone: 'UTC',
    source: 'epw',
  };
}

/**
 * Combine the two halves of an archive.
 *
 * **The DDY supplies the level and the EPW supplies the shape.** This is the
 * one piece of real judgement in the file path, and it goes against the DDY's
 * own convention on purpose:
 *
 * The ASHRAE heating design day is *isothermal* — its daily range is zero,
 * because equipment is sized against a steady worst case. Using it as drawn
 * would make every building fail by more, and for the wrong reason: a flat day
 * at the design minimum is colder for 23 hours than any real day ever is. So
 * the published minimum is taken, and the diurnal shape comes from the file's
 * own cold days.
 */
function combine(epwText: string, ddyText: string | null) {
  const epw = parseEpw(epwText);
  if (epw.samples.length === 0) {
    return { failure: epw.problems[0] ?? 'No usable hourly temperatures were found.' };
  }

  const { designDay, diagnostics } = deriveDesignDay(epw.samples, {
    sourceLabel: `EPW, ${describeLocation(epw.location)}`,
  });

  const problems = [...epw.problems];

  /*
   * A TMY is ONE year, not ten, so the +2 K cold-day window catches far fewer
   * days than the archive path does — a real Boston TMYx yields six against the
   * archive's eighty. Six days is a thin basis for averaging a diurnal shape,
   * and the user should be told rather than left to assume the two paths are
   * equally well supported.
   */
  if (diagnostics.coldDaysSelected < 15) {
    problems.push(
      `Only ${diagnostics.coldDaysSelected} cold days in this file were close enough to the design minimum to shape the day — a typical year holds far fewer than a ten-year record, so the shape is less well supported than a searched location's.`,
    );
  }
  let day: DesignDay = { ...designDay, basis: 'epw-percentile' };
  let summary =
    `Derived from ${diagnostics.hoursRead.toLocaleString('en-US')} hours in the file — ` +
    `the coldest 0.4% for the minimum, ${diagnostics.coldDaysSelected} cold days for the shape.`;

  if (ddyText) {
    const ddy = parseDdy(ddyText);
    problems.push(...ddy.problems);
    if (ddy.heating) {
      day = withMinimum(
        day,
        ddy.heating.dryBulb,
        `ASHRAE 99.6% heating DB from the .ddy (${ddy.heating.dryBulb.toFixed(1)} °C), with the diurnal shape derived from the .epw`,
      );
      day = { ...day, basis: 'ddy-99.6' };
      summary =
        `Minimum ${ddy.heating.dryBulb.toFixed(1)} °C from the .ddy — the published ASHRAE 99.6% condition — ` +
        `with the shape derived from ${diagnostics.coldDaysSelected} cold days in the .epw.`;
    }
  }

  return { day, site: siteFrom(epw.location), problems, summary };
}

export async function readWeatherFile(file: File): Promise<WeatherFileOutcome> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.epw')) {
    const result = combine(await file.text(), null);
    if ('failure' in result) return { ok: false, message: result.failure! };
    return { ok: true, value: { designDay: result.day!, site: result.site!, problems: result.problems!, summary: result.summary! } };
  }

  if (!name.endsWith('.zip')) {
    return { ok: false, message: 'Drop an .epw file, or the whole .zip a weather download comes in.' };
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return { ok: false, message: 'This .zip could not be opened.' };
  }

  const epwName = Object.keys(entries).find((entry) => entry.toLowerCase().endsWith('.epw'));
  if (!epwName) {
    return {
      ok: false,
      message: 'No .epw inside this archive. A Climate.OneBuilding download carries one alongside the .ddy.',
    };
  }

  // The .ddy is the more consequential half for this tool, but its absence is
  // not an error — some archives carry only the EPW, and that path still works.
  const ddyName = Object.keys(entries).find((entry) => entry.toLowerCase().endsWith('.ddy'));

  let ddyText: string | null = null;
  const extraProblems: string[] = [];
  if (ddyName) {
    try {
      ddyText = strFromU8(entries[ddyName]!);
    } catch {
      extraProblems.push('The .ddy in this archive could not be read. The hourly data is unaffected.');
    }
  }

  const result = combine(strFromU8(entries[epwName]!), ddyText);
  if ('failure' in result) return { ok: false, message: result.failure! };

  return {
    ok: true,
    value: {
      designDay: result.day!,
      site: result.site!,
      problems: [...result.problems!, ...extraProblems],
      summary: result.summary!,
    },
  };
}
