import { describe, expect, it } from 'vitest';
import { DEFAULT_VENTILATION } from '../src/model/ventilation';

import { decodeState, encodeState, SHARE_PARAM } from '../src/io/share';
import type { ShareState } from '../src/io/share';
import { solve } from '../src/engine/balance';
import { setDensity, setScheduleHour } from '../src/model/editGains';
import {
  SAMPLE_CONDITIONS,
  SAMPLE_DESIGN_DAY,
  SAMPLE_ENVELOPE,
  SAMPLE_GAINS,
  SAMPLE_SITE,
} from '../src/model/sampleProject';

const base: ShareState = {
  units: 'IP',
  site: SAMPLE_SITE,
  designDay: SAMPLE_DESIGN_DAY,
  conditions: SAMPLE_CONDITIONS,
  envelope: SAMPLE_ENVELOPE,
  gains: SAMPLE_GAINS,
  ventilation: DEFAULT_VENTILATION,
};

describe('a share link survives the round trip', () => {
  const decoded = decodeState(encodeState(base))!;

  it('decodes at all', () => {
    expect(decoded).not.toBeNull();
  });

  it('brings back the same building', () => {
    expect(decoded.envelope.floorArea).toBeCloseTo(base.envelope.floorArea, 6);
    expect(decoded.envelope.surfaces).toHaveLength(base.envelope.surfaces.length);
    base.envelope.surfaces.forEach((surface, index) => {
      const back = decoded.envelope.surfaces[index]!;
      expect(back.id).toBe(surface.id);
      expect(back.category).toBe(surface.category);
      expect(back.boundary).toBe(surface.boundary);
      expect(back.area).toBeCloseTo(surface.area, 1);
      expect(back.uValue).toBeCloseTo(surface.uValue, 4);
    });
  });

  it('brings back the same design day, hour for hour', () => {
    expect(decoded.designDay.hours).toHaveLength(24);
    base.designDay.hours.forEach((hour, index) => {
      expect(decoded.designDay.hours[index]!.tdb).toBeCloseTo(hour.tdb, 2);
    });
    expect(decoded.designDay.minimum).toBeCloseTo(base.designDay.minimum, 2);
    expect(decoded.designDay.provenance).toBe(base.designDay.provenance);
  });

  it('brings back the same schedules', () => {
    for (const key of ['occupancy', 'lighting', 'miscEquipment', 'itEquipment'] as const) {
      const before = base.gains.schedules[key].fractions;
      const after = decoded.gains.schedules[key].fractions;
      expect(after).toHaveLength(24);
      before.forEach((fraction, hour) => expect(after[hour]!).toBeCloseTo(fraction, 2));
    }
  });

  it('reaches the same verdict — which is the only thing that really matters', () => {
    // A link that decodes into a building reaching a different answer is worse
    // than one that fails to decode at all.
    const original = solve(base);
    const shared = solve(decoded);
    expect(shared.deficitHours).toBe(original.deficitHours);
    expect(shared.worstHour).toBe(original.worstHour);
    expect(shared.peakHeatingLoadPerArea).toBeCloseTo(original.peakHeatingLoadPerArea, 2);
    expect(shared.balancePoint.onMeanGain).toBeCloseTo(original.balancePoint.onMeanGain, 2);
    expect(shared.lever?.slot).toBe(original.lever?.slot);
  });

  it('carries the unit system, so the recipient sees what the sender saw', () => {
    expect(decodeState(encodeState({ ...base, units: 'SI' }))!.units).toBe('SI');
  });

  it('carries an edited state, not just the sample', () => {
    const edited = {
      ...base,
      gains: setScheduleHour(setDensity(base.gains, 'lighting', 9.5), 'occupancy', 3, 0.75),
    };
    const back = decodeState(encodeState(edited))!;
    expect(back.gains.lighting.powerDensity).toBeCloseTo(9.5, 3);
    expect(back.gains.schedules.occupancy.fractions[3]).toBeCloseTo(0.75, 2);
    // An edited project is not a preset one, and the badge must not come back.
    expect(back.gains.preset).toBeNull();
  });
});

describe('the link stays a link', () => {
  it('is short enough to survive a mail client', () => {
    // A naive JSON.stringify of this state runs past 2,000 characters, which
    // some clients wrap and some chat apps truncate — producing a link that
    // looks fine and is broken.
    const encoded = encodeState(base);
    expect(encoded.length).toBeLessThan(1400);
  });

  it('uses base64url, so nothing needs escaping in a query string', () => {
    const encoded = encodeState(base);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  it('names its parameter', () => {
    expect(SHARE_PARAM).toBe('p');
  });
});

describe('a broken link fails safely', () => {
  /**
   * Every one of these must return null rather than throw. The caller falls
   * back to the sample, so a mangled link costs the shared building and not the
   * whole page.
   */
  it.each([
    ['empty', ''],
    ['not base64', '!!!!'],
    ['truncated', encodeState(base).slice(0, 60)],
    ['valid base64, not JSON', btoa('hello there')],
    ['JSON, wrong shape', btoa('{"nope":1}')],
  ])('%s', (_label, encoded) => {
    expect(() => decodeState(encoded)).not.toThrow();
    expect(decodeState(encoded)).toBeNull();
  });

  it('refuses a link from a future version rather than half-reading it', () => {
    // Half-reading produces a plausible-looking building that is not the one
    // that was sent, which is worse than declining outright.
    const future = base64url(JSON.stringify({ v: 99, u: 'IP' }));
    expect(decodeState(future)).toBeNull();
  });

  it('accepts the current version, so the guard is not just refusing everything', () => {
    // Without this, the test above would pass on a decoder that never works.
    expect(decodeState(encodeState(base))).not.toBeNull();
  });
});

/** base64url, matching what `encodeState` emits. */
function base64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The version 1 link.
 *
 * Version 2 changed what `i[0]` MEANS — W/m² of IT became absolute kW — without
 * changing the payload's shape. So an old link still parses, and read as a v2
 * link it describes a different building: the worked example's 1.0 W/m² would
 * come back as 1 kW, twice the 0.5 kW it stood for. A link that silently means
 * something else is worse than one that fails, and this one fails in the term
 * that runs all night and decides the verdict.
 */
describe('a version 1 link is migrated, not misread', () => {
  /** Re-encode a current link as a v1 payload carrying the old density. */
  const asV1 = (wattsPerSqM: number): string => {
    const encoded = encodeState(base);
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const payload = JSON.parse(json);
    payload.v = 1;
    payload.g.i[0] = wattsPerSqM;
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  it('recovers the kilowatts the old density stood for', () => {
    // 1.0 W/m² over the worked example's 500 m² was 500 W. That is 0.5 kW.
    const decoded = decodeState(asV1(1.0));
    expect(decoded).not.toBeNull();
    expect(decoded!.gains.itEquipment.kilowatts).toBeCloseTo(0.5, 6);
  });

  it('lands the migrated link on the same balance as the current one', () => {
    // The real test: not that a field matches, but that the building does.
    const fromOld = decodeState(asV1(1.0))!;
    const fromNew = decodeState(encodeState(base))!;
    const answer = (state: typeof base) =>
      solve({
        envelope: state.envelope,
        gains: state.gains,
        ventilation: DEFAULT_VENTILATION,
        conditions: state.conditions,
        designDay: state.designDay,
      }).peakHeatingLoad;

    expect(answer(fromOld)).toBeCloseTo(answer(fromNew), 6);
  });

  it('scales a v1 link by ITS OWN floor area, not a fixed one', () => {
    // The multiplication has to use the area travelling in the same payload,
    // which is the area the density was quoted against.
    const big = { ...base, envelope: { ...SAMPLE_ENVELOPE, floorArea: 5000 } };
    const encoded = encodeState(big);
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)));
    payload.v = 1;
    payload.g.i[0] = 1.0;
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const link = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    expect(decodeState(link)!.gains.itEquipment.kilowatts).toBeCloseTo(5, 6);
  });

  it('still refuses a link from a version it cannot read', () => {
    const encoded = encodeState(base);
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)));
    payload.v = 99;
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const link = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    expect(decodeState(link)).toBeNull();
  });
});
