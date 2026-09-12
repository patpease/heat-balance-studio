import { describe, expect, it } from 'vitest';

import { arrowGeometry, MAX_SCALE, MAX_WIDTH, MIN_WIDTH, referenceWatts, SHAFT_LENGTH } from '../src/chart/arrowScale';
import { areasFromBox, DEFAULT_BOX } from '../src/engine/sketchBox';
import { BUILDING_TYPES, OFFICE, buildingType } from '../src/model/buildingTypes';
import { solve } from '../src/engine/balance';
import { wallToFloorRatio } from '../src/engine/ua';
import { BOSTON_CASE } from './fixtures/boston-office';

const result = solve(BOSTON_CASE);
const allTerms = result.hours.flatMap((h) => [...h.lossTerms, ...h.gainTerms].map((t) => t.watts));
const reference = referenceWatts(allTerms);

describe('the building type record', () => {
  it('carries an anchor for every slot the engine produces', () => {
    // The contract between the drawing and the engine. A term with no anchor
    // would be silently undrawn.
    const slots = new Set(OFFICE.anchors.map((a) => a.slot));
    const worst = result.hours[result.worstHour]!;
    for (const term of [...worst.lossTerms, ...worst.gainTerms]) {
      expect(slots.has(term.slot)).toBe(true);
    }
  });

  it('has nine anchors — the canvas draws eight, IT is the ninth', () => {
    expect(OFFICE.anchors).toHaveLength(9);
    expect(OFFICE.anchors.map((a) => a.slot)).toContain('gain-it-equipment');
    expect(OFFICE.anchors.map((a) => a.slot)).toContain('gain-misc-equipment');
  });

  it('names no slot twice', () => {
    const slots = OFFICE.anchors.map((a) => a.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('points losses out of the building and gains up into it', () => {
    const by = (slot: string) => OFFICE.anchors.find((a) => a.slot === slot)!;
    expect(by('loss-walls').rotate).toBe(180); // west, out
    expect(by('loss-windows').rotate).toBe(0); // east, out
    expect(by('loss-roof').rotate).toBe(-90); // up, out
    expect(by('loss-ground-floor').rotate).toBe(90); // down, out
    // Gains all point upward-ish, into the space.
    for (const slot of ['gain-people', 'gain-misc-equipment', 'gain-it-equipment']) {
      expect(Math.sin((by(slot).rotate * Math.PI) / 180)).toBeLessThan(0);
    }
  });

  it('ships one type in v1 and resolves unknown ids to it', () => {
    expect(BUILDING_TYPES).toHaveLength(1);
    expect(buildingType('office')).toBe(OFFICE);
    expect(buildingType('lab')).toBe(OFFICE);
  });
});

describe('the arrow scale', () => {
  it('puts the largest term in the project exactly at the ceiling', () => {
    const largest = Math.max(...allTerms.map(Math.abs));
    expect(arrowGeometry(largest, reference).scale).toBeCloseTo(MAX_SCALE, 6);
  });

  it('does NOT saturate on the real worked example', () => {
    // The bug the fixed 800 W reference would have had: windows at 4,129 W and
    // roof at 2,687 W both clamp to 2.3 and render identically, despite a 1.5×
    // difference. With a derived reference they stay distinct.
    const worst = result.hours[result.worstHour]!;
    const windows = worst.lossTerms.find((t) => t.slot === 'loss-windows')!.watts;
    const roof = worst.lossTerms.find((t) => t.slot === 'loss-roof')!.watts;

    const fixed800 = { windows: arrowGeometry(windows, 800), roof: arrowGeometry(roof, 800) };
    expect(fixed800.windows.scale).toBe(fixed800.roof.scale); // both clamped — indistinguishable

    const derived = { windows: arrowGeometry(windows, reference), roof: arrowGeometry(roof, reference) };
    expect(derived.windows.scale).toBeGreaterThan(derived.roof.scale);
    expect(derived.windows.scale / derived.roof.scale).toBeCloseTo(windows / roof, 2);
  });

  it('draws NOTHING for a zero term', () => {
    // People at 06:00 is exactly 0 W. A stub arrow there is the drawing
    // asserting a gain that is not present.
    const geometry = arrowGeometry(0, reference);
    expect(geometry.visible).toBe(false);

    const worst = result.hours[result.worstHour]!;
    const people = worst.gainTerms.find((t) => t.slot === 'gain-people')!;
    expect(people.watts).toBe(0);
    expect(arrowGeometry(people.watts, reference).visible).toBe(false);
  });

  it('draws nothing when there is no reference at all', () => {
    expect(referenceWatts([0, 0, 0])).toBeNull();
    expect(arrowGeometry(100, null).visible).toBe(false);
  });

  it('keeps the arrowhead undistorted by translating it', () => {
    // scale(k,1) stretches the shaft on x only; the head is a separate group
    // pushed out by exactly the amount the shaft grew.
    const g = arrowGeometry(1000, 1000);
    expect(g.scale).toBeCloseTo(1, 6);
    expect(g.tipOffset).toBeCloseTo(0, 6);

    const doubled = arrowGeometry(2000, 1000);
    expect(doubled.tipOffset).toBeCloseTo(SHAFT_LENGTH * (doubled.scale - 1), 6);
  });

  it('keeps stroke weight inside the band the canvas uses', () => {
    for (const watts of [1, 500, 4129, 99999]) {
      const w = arrowGeometry(watts, reference).strokeWidth;
      expect(w).toBeGreaterThanOrEqual(MIN_WIDTH);
      expect(w).toBeLessThanOrEqual(MAX_WIDTH);
    }
  });

  it('makes a bigger term both longer and heavier', () => {
    const small = arrowGeometry(800, reference);
    const large = arrowGeometry(3200, reference);
    expect(large.scale).toBeGreaterThan(small.scale);
    expect(large.strokeWidth).toBeGreaterThan(small.strokeWidth);
  });

  it('holds one reference across all 24 hours', () => {
    // Per-hour normalisation would rescale the drawing as you scrub and hide
    // the gains collapsing overnight — the thing scrubbing is for.
    const noon = result.hours[13]!;
    const night = result.hours[3]!;
    const noonIt = noon.gainTerms.find((t) => t.slot === 'gain-it-equipment')!;
    const nightIt = night.gainTerms.find((t) => t.slot === 'gain-it-equipment')!;
    expect(noonIt.watts).toBe(nightIt.watts); // IT is flat
    expect(arrowGeometry(noonIt.watts, reference).scale)
      .toBe(arrowGeometry(nightIt.watts, reference).scale);

    const noonPeople = noon.gainTerms.find((t) => t.slot === 'gain-people')!;
    const nightPeople = night.gainTerms.find((t) => t.slot === 'gain-people')!;
    expect(arrowGeometry(noonPeople.watts, reference).visible).toBe(true);
    expect(arrowGeometry(nightPeople.watts, reference).visible).toBe(false);
  });
});

describe('sketch a box', () => {
  it('reproduces the worked example geometry from five dimensions', () => {
    const areas = areasFromBox(DEFAULT_BOX);
    expect(areas.floorArea).toBe(500);
    expect(areas.wallArea).toBeCloseTo(220.5, 6);
    expect(areas.windowArea).toBeCloseTo(94.5, 6);
    expect(areas.roofArea).toBe(500);
    expect(areas.groundFloorArea).toBe(500);
    expect(areas.exposedFloorArea).toBe(0);
    expect(areas.wallToFloorRatio).toBeCloseTo(0.63, 10);
  });

  it('agrees with the engine on wall-to-floor ratio', () => {
    expect(areasFromBox(DEFAULT_BOX).wallToFloorRatio)
      .toBeCloseTo(wallToFloorRatio(BOSTON_CASE.envelope), 6);
  });

  it('counts roof and ground floor ONCE however many storeys there are', () => {
    // The obvious slip is multiplying them by storeys, which roughly doubles a
    // tall building's envelope.
    const tall = areasFromBox({ ...DEFAULT_BOX, storeys: 4 });
    expect(tall.floorArea).toBe(2000);
    expect(tall.roofArea).toBe(500);
    expect(tall.groundFloorArea).toBe(500);
    expect(tall.wallArea).toBeCloseTo(220.5 * 4, 6);
  });

  it('shows a tall thin building having a worse wall-to-floor ratio', () => {
    // The tool's thesis, in one assertion: more wall per unit of floor is a
    // harder building to self-heat.
    const squat = areasFromBox({ ...DEFAULT_BOX, length: 40, width: 40, storeys: 1 });
    const thin = areasFromBox({ ...DEFAULT_BOX, length: 60, width: 8, storeys: 1 });
    expect(thin.wallToFloorRatio).toBeGreaterThan(squat.wallToFloorRatio);
  });

  it('clamps a nonsense window ratio rather than producing negative wall', () => {
    expect(areasFromBox({ ...DEFAULT_BOX, windowToWallRatio: 2 }).wallArea).toBe(0);
    expect(areasFromBox({ ...DEFAULT_BOX, windowToWallRatio: -1 }).windowArea).toBe(0);
  });

  it('survives a zero-size box without dividing by zero', () => {
    const empty = areasFromBox({ ...DEFAULT_BOX, length: 0, width: 0 });
    expect(empty.floorArea).toBe(0);
    expect(empty.wallToFloorRatio).toBe(0);
  });
});
