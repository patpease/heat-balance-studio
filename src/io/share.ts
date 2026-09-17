/**
 * Share links.
 *
 * The whole state goes in the URL — there is no store behind it and no project
 * file to version. "Send someone the building you just screened" is most of
 * what a project file would have been used for at this scale, and a link does
 * it without a format to maintain.
 *
 * **Encoding is compact on purpose.** The design day alone is 24 temperatures,
 * and a naive `JSON.stringify` of the whole project runs past 2,000 characters
 * — which some mail clients wrap and some chat clients truncate, both of which
 * produce a link that looks fine and is broken. Numbers are rounded to the
 * precision the tool actually uses and packed positionally.
 */

import { DEFAULT_GAINS, DEFAULT_SETPOINT_C } from '../model/defaults';
import { customSchedule } from '../model/schedules';
import type { Airtightness } from '../model/airtightness';
import type {
  Conditions,
  DesignDay,
  Envelope,
  Gains,
  ItCooling,
  Site,
  Surface,
  UnitSystem,
} from '../model/types';

export interface ShareState {
  readonly units: UnitSystem;
  readonly site: Site;
  readonly designDay: DesignDay;
  readonly conditions: Conditions;
  readonly envelope: Envelope;
  readonly gains: Gains;
}

/**
 * 2: IT equipment became an absolute kW rather than a W/m² density.
 *
 * The payload SHAPE did not change — `i[0]` is still one number in the same
 * slot — so a version 1 link decodes cleanly and describes a different
 * building. A shared link that silently means something else is worse than one
 * that fails outright, and this one would fail invisibly, in the term that runs
 * 24 hours a day and decides the overnight verdict.
 *
 * Version 1 links are therefore migrated rather than rejected. The old value
 * was W/m² of the floor area travelling in the same payload, so the kilowatts
 * it meant can be recovered exactly — it is the same multiplication the engine
 * used to do at solve time.
 *
 * 3: φ became a cooling medium. `i[1]` was a number 0–1 and is now one of
 * 'air' | 'chilled-water' | 'rejected'. Both older versions carried φ = 1 in
 * practice, because nothing in the UI could change it — so they migrate to
 * 'air', which is what φ = 1 meant: every watt into the room.
 */
const VERSION = 3;

/** Round for the wire: areas to 0.1 m², U-values to 3 dp, temperatures to 2. */
const r = (value: number, places: number): number => Number(value.toFixed(places));

/** Schedules are 24 fractions of 0–1; two digits each is plenty. */
function packSchedule(fractions: readonly number[]): string {
  return fractions.map((f) => Math.round(Math.min(1, Math.max(0, f)) * 100).toString(36).padStart(2, '0')).join('');
}

function unpackSchedule(packed: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < 24; i++) {
    const chunk = packed.slice(i * 2, i * 2 + 2);
    const value = Number.parseInt(chunk, 36);
    out.push(Number.isFinite(value) ? Math.min(1, Math.max(0, value / 100)) : 0);
  }
  return out;
}

export function encodeState(state: ShareState): string {
  const payload = {
    v: VERSION,
    u: state.units,
    s: [state.site.label, r(state.site.latitude, 4), r(state.site.longitude, 4), r(state.site.elevation, 0), state.site.timezone],
    d: {
      b: state.designDay.basis,
      p: state.designDay.percentile,
      y: state.designDay.yearsOfRecord,
      m: r(state.designDay.minimum, 2),
      r: r(state.designDay.dailyRange, 2),
      a: r(state.designDay.annualMeanTemperature, 2),
      t: state.designDay.hours.map((h) => r(h.tdb, 2)),
      v: state.designDay.provenance,
    },
    c: [
      r(state.conditions.indoorSetpoint, 3),
      r(state.conditions.groundTemperature, 3),
      state.conditions.groundTemperatureBasis,
      state.conditions.flatDesignDay ? 1 : 0,
      r(state.conditions.siteElevation, 0),
    ],
    e: {
      a: r(state.envelope.floorArea, 1),
      t: state.envelope.airtightness,
      h: r(state.envelope.storeyHeight, 2),
      n: state.envelope.storeys,
      s: state.envelope.surfaces.map((surface) => [
        surface.id,
        surface.category,
        surface.label,
        r(surface.area, 1),
        r(surface.uValue, 4),
        surface.boundary,
      ]),
    },
    g: {
      o: [state.gains.occupancy.mode, r(state.gains.occupancy.areaPerPerson, 3), r(state.gains.occupancy.count, 1), r(state.gains.occupancy.sensiblePerPerson, 1)],
      l: r(state.gains.lighting.powerDensity, 3),
      m: r(state.gains.miscEquipment.powerDensity, 3),
      i: [r(state.gains.itEquipment.kilowatts, 3), state.gains.itEquipment.cooling],
      p: state.gains.preset,
      sid: state.gains.sourceId,
      k: [
        packSchedule(state.gains.schedules.occupancy.fractions),
        packSchedule(state.gains.schedules.lighting.fractions),
        packSchedule(state.gains.schedules.miscEquipment.fractions),
        packSchedule(state.gains.schedules.itEquipment.fractions),
      ],
    },
  };

  // base64url: `+`, `/` and `=` all get mangled somewhere along the way — in a
  // query string, in a mail client, or by a chat app that "helpfully" strips
  // trailing punctuation from a link.
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Absent in links written before v4. */
function readAirtightness(raw: unknown): Airtightness {
  return raw === 'leaky' || raw === 'typical' || raw === 'tight' ? raw : 'typical';
}

/** `i[1]` across three versions: a φ number before, a medium after. */
function readCooling(raw: unknown): ItCooling {
  if (raw === 'air' || raw === 'chilled-water' || raw === 'rejected') return raw;
  const phi = Number(raw);
  return Number.isFinite(phi) && phi >= 0.5 ? 'air' : 'rejected';
}

export function decodeState(encoded: string): ShareState | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));

    // A link from a FUTURE version is a link this build cannot honour. Say so
    // by returning null rather than half-reading it into a plausible-looking
    // building that is not the one that was sent. An older version we can still
    // read faithfully is migrated instead — see the note on VERSION.
    if (payload?.v !== VERSION && payload?.v !== 1 && payload?.v !== 2) return null;

    const surfaces: Surface[] = payload.e.s.map((entry: unknown[]) => ({
      id: String(entry[0]),
      category: entry[1] as Surface['category'],
      label: String(entry[2]),
      area: Number(entry[3]),
      uValue: Number(entry[4]),
      boundary: entry[5] as Surface['boundary'],
      bufferFactor: 1,
      orientation: null,
      shgc: null,
    }));

    const schedules = payload.g.k.map(unpackSchedule);

    const gains: Gains = {
      occupancy: {
        mode: payload.g.o[0],
        areaPerPerson: Number(payload.g.o[1]),
        count: Number(payload.g.o[2]),
        sensiblePerPerson: Number(payload.g.o[3]),
      },
      lighting: { powerDensity: Number(payload.g.l) },
      miscEquipment: { powerDensity: Number(payload.g.m) },
      itEquipment: {
        // A v1 link carries W/m² in this slot. Multiply by the floor area it
        // was quoted against, which travels in the same payload, to recover the
        // kilowatts it always meant.
        kilowatts:
          payload.v === 1
            ? r((Number(payload.g.i[0]) * Number(payload.e.a)) / 1000, 3)
            : Number(payload.g.i[0]),
        // v1 and v2 carry φ here as a number. φ = 1 meant every watt reached
        // the room, which is what 'air' means now; anything less meant some of
        // it went somewhere the tool did not model, and 'rejected' is the
        // conservative reading of that.
        cooling: readCooling(payload.g.i[1]),
      },
      schedules: {
        occupancy: customSchedule(schedules[0]!),
        lighting: customSchedule(schedules[1]!),
        miscEquipment: customSchedule(schedules[2]!),
        itEquipment: customSchedule(schedules[3]!),
      },
      preset: payload.g.p ?? null,
      sourceId: payload.g.sid ?? null,
    };

    return {
      units: payload.u === 'SI' ? 'SI' : 'IP',
      site: {
        label: String(payload.s[0]),
        latitude: Number(payload.s[1]),
        longitude: Number(payload.s[2]),
        elevation: Number(payload.s[3]),
        timezone: String(payload.s[4]),
        source: 'geocoded',
      },
      designDay: {
        basis: payload.d.b,
        percentile: payload.d.p ?? null,
        yearsOfRecord: payload.d.y ?? null,
        minimum: Number(payload.d.m),
        dailyRange: Number(payload.d.r),
        annualMeanTemperature: Number(payload.d.a),
        hours: payload.d.t.map((tdb: number, hour: number) => ({
          hour,
          tdb: Number(tdb),
          ghi: null,
          dni: null,
          dhi: null,
        })),
        provenance: String(payload.d.v),
      },
      conditions: {
        indoorSetpoint: Number(payload.c[0]) || DEFAULT_SETPOINT_C,
        groundTemperature: Number(payload.c[1]),
        groundTemperatureBasis: payload.c[2],
        // Absent in every link written before the toggle existed, and absent
        // reads as off — which is the default and what those links meant.
        flatDesignDay: payload.c[3] === 1,
        // Absent before v4, and absent reads as sea level — which is what a
        // link written before this carried by not carrying anything.
        siteElevation: Number(payload.c[4]) || 0,
      },
      envelope: {
        floorArea: Number(payload.e.a),
        storeyHeight: Number(payload.e.h),
        storeys: Number(payload.e.n),
        // Absent before v4. 'typical' is the default and the code requirement,
        // so an older link describes a building built to code — which is what
        // it was describing before infiltration existed, minus the leakage.
        airtightness: readAirtightness(payload.e.t),
        surfaces,
      },
      gains: gains.schedules.occupancy.fractions.length === 24 ? gains : DEFAULT_GAINS,
    };
  } catch {
    // A truncated or mangled link is common enough to be expected. It must not
    // throw into a blank screen — the caller falls back to the sample.
    return null;
  }
}

export const SHARE_PARAM = 'p';

export function shareUrl(state: ShareState, base = window.location.href): string {
  const url = new URL(base);
  url.hash = '';
  url.search = '';
  url.searchParams.set(SHARE_PARAM, encodeState(state));
  return url.toString();
}

export function stateFromLocation(search = window.location.search): ShareState | null {
  const encoded = new URLSearchParams(search).get(SHARE_PARAM);
  return encoded ? decodeState(encoded) : null;
}
