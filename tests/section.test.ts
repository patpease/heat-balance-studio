import { describe, expect, it } from 'vitest';
import { lossPlacement } from '../src/chart/SectionDrawing';

import { MAX_HEAD_SCALE, MAX_SCALE, MAX_WIDTH, MIN_WIDTH, SHAFT_LENGTH, arrowGeometry, referenceWatts } from '../src/chart/arrowScale';
import { areasFromBox, DEFAULT_BOX } from '../src/engine/sketchBox';
import { BUILDING_TYPES, GROUND_LINES, OFFICE, PERSON_HEADS, buildingType } from '../src/model/buildingTypes';
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

  it('ships all six massings and resolves an unknown id to the office', () => {
    expect(BUILDING_TYPES).toHaveLength(6);
    expect(BUILDING_TYPES.map((t) => t.id).sort())
      .toEqual(['civic', 'home', 'lab', 'multifamily', 'office', 'school']);
    expect(buildingType('office')).toBe(OFFICE);
    expect(buildingType('lab')).not.toBe(OFFICE);
  });

  it('gives every massing the same nine slots, which is what lets one renderer draw them all', () => {
    // `data-surface` on the canvas and SurfaceSlot in the model are the same
    // names on purpose. If a massing were missing a slot, that surface's arrow
    // would silently not be drawn.
    const expected = [...OFFICE.anchors.map((a) => a.slot)].sort();
    for (const type of BUILDING_TYPES) {
      expect([...type.anchors.map((a) => a.slot)].sort(), type.id).toEqual(expected);
    }
  });

  it('gives every massing a ground line, a head and a crop', () => {
    for (const type of BUILDING_TYPES) {
      expect(GROUND_LINES[type.id], type.id).toMatch(/^M/);
      expect(PERSON_HEADS[type.id].r, type.id).toBeGreaterThan(0);
      expect(type.viewBox.split(' '), type.id).toHaveLength(4);
      expect(type.shell.length, type.id).toBeGreaterThan(3);
      expect(type.soil.length, type.id).toBeGreaterThan(0);
    }
  });

  it('draws the IT rack clear of the equipment it was copied from', () => {
    // The canvas predates the misc/IT split, so both the ninth arrow and the
    // rack it leaves from are derived. They must agree, and must not overlap
    // the equipment glyph.
    for (const type of BUILDING_TYPES) {
      const misc = type.anchors.find((a) => a.slot === 'gain-misc-equipment')!;
      const it = type.anchors.find((a) => a.slot === 'gain-it-equipment')!;
      expect(it.x, type.id).toBeGreaterThan(misc.x);
      expect(it.y, type.id).toBe(misc.y);
      expect(it.rotate, type.id).toBe(misc.rotate);
    }
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
  /** The Boston worked example, which DEFAULT_BOX no longer is. */
  const WORKED_EXAMPLE = { length: 25, width: 20, height: 3.5, storeys: 1, windowToWallRatio: 0.3 };

  it('reproduces the worked example geometry from five dimensions', () => {
    const areas = areasFromBox(WORKED_EXAMPLE);
    expect(areas.floorArea).toBe(500);
    expect(areas.wallArea).toBeCloseTo(220.5, 6);
    expect(areas.windowArea).toBeCloseTo(94.5, 6);
    expect(areas.roofArea).toBe(500);
    expect(areas.groundFloorArea).toBe(500);
    expect(areas.exposedFloorArea).toBe(0);
    expect(areas.wallToFloorRatio).toBeCloseTo(0.63, 10);
  });

  it('agrees with the engine on wall-to-floor ratio', () => {
    expect(areasFromBox(WORKED_EXAMPLE).wallToFloorRatio)
      .toBeCloseTo(wallToFloorRatio(BOSTON_CASE.envelope), 6);
  });

  it('counts roof and ground floor ONCE however many storeys there are', () => {
    // The obvious slip is multiplying them by storeys, which roughly doubles a
    // tall building's envelope.
    const tall = areasFromBox({ ...WORKED_EXAMPLE, storeys: 4 });
    expect(tall.roofArea).toBe(500);
    expect(tall.groundFloorArea).toBe(500);
  });

  it('reads the height field as the WHOLE building, not one storey', () => {
    // The field changed meaning: 14 m over four storeys is a 14 m building, not
    // a 56 m one. Wall area is the perimeter times the overall height whatever
    // the storey count, and only the floor area follows the storeys.
    const one = areasFromBox({ ...WORKED_EXAMPLE, height: 14, storeys: 1 });
    const four = areasFromBox({ ...WORKED_EXAMPLE, height: 14, storeys: 4 });
    expect(four.wallArea).toBeCloseTo(one.wallArea, 9);
    expect(four.floorArea).toBe(one.floorArea * 4);
    expect(four.storeyHeight).toBeCloseTo(3.5, 9);
    expect(one.storeyHeight).toBeCloseTo(14, 9);
  });

  it('gives the default box a gross floor area above its ground floor', () => {
    // The rule the sixth table row enforces: gross floor can equal the floors
    // on the ground, never fall below them.
    const areas = areasFromBox(DEFAULT_BOX);
    expect(areas.floorArea).toBeGreaterThanOrEqual(areas.groundFloorArea + areas.exposedFloorArea);
    expect(areas.floorArea).toBe(6000);
  });

  it('shows a tall thin building having a worse wall-to-floor ratio', () => {
    // The tool's thesis, in one assertion: more wall per unit of floor is a
    // harder building to self-heat.
    const squat = areasFromBox({ ...WORKED_EXAMPLE, length: 40, width: 40, storeys: 1 });
    const thin = areasFromBox({ ...WORKED_EXAMPLE, length: 60, width: 8, storeys: 1 });
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

describe('the arrowhead keeps up with the shaft', () => {
  /**
   * The head was a fixed 22-unit shape while the stroke ran 2.2 to 6.2, so the
   * heaviest arrow — the one carrying the biggest number — wore the same small
   * head as the lightest and read as a blunt bar.
   */
  const light = arrowGeometry(1, 100);
  const heavy = arrowGeometry(100, 100);

  it('grows the head as the stroke thickens', () => {
    expect(heavy.strokeWidth).toBeGreaterThan(light.strokeWidth);
    expect(heavy.headScale).toBeGreaterThan(light.headScale);
  });

  it('holds the head-to-stroke ratio roughly constant', () => {
    // That IS the requirement: a similar proportion at every value.
    const ratio = (g: { headScale: number; strokeWidth: number }) => g.headScale / g.strokeWidth;
    expect(ratio(heavy)).toBeCloseTo(ratio(light), 1);
  });

  it('starts at 1 so the lightest arrow is unchanged', () => {
    // Not exactly 1: the WIDTH reads the raw ratio while the LENGTH is floored
    // at MIN_SCALE, so a term far below the floor still carries a hair more
    // stroke than the minimum. Within a percent is the honest claim.
    expect(light.headScale).toBeGreaterThanOrEqual(1);
    expect(light.headScale).toBeLessThan(1.01);
  });

  it('caps, so the longest arrow is still an arrow and not a triangle', () => {
    expect(heavy.headScale).toBeLessThanOrEqual(MAX_HEAD_SCALE);
    for (const watts of [0.1, 1, 25, 60, 100, 1000]) {
      const g = arrowGeometry(watts, 100);
      expect(g.headScale, `${watts} W`).toBeGreaterThanOrEqual(1);
      expect(g.headScale, `${watts} W`).toBeLessThanOrEqual(MAX_HEAD_SCALE);
    }
  });

  it('draws no head at all for a zero term', () => {
    expect(arrowGeometry(0, 100).visible).toBe(false);
  });
});

describe('a loss label goes to the side its arrow actually leaves from', () => {
  /**
   * This was keyed on the slot name, which looked right on the office and was
   * wrong on the school — that massing mirrors it, so its wall arrow leaves to
   * the RIGHT and its window arrow to the LEFT. Both labels went to the wrong
   * side and landed on top of the building. The direction is in the data; read
   * it from there.
   */
  it('follows the rotation, not the slot', () => {
    expect(lossPlacement(0, 'loss-walls').dx).toBeGreaterThan(0);
    expect(lossPlacement(180, 'loss-walls').dx).toBeLessThan(0);
    expect(lossPlacement(0, 'loss-windows').dx).toBeGreaterThan(0);
    expect(lossPlacement(180, 'loss-windows').dx).toBeLessThan(0);
  });

  it('sends the text outward, away from the building', () => {
    expect(lossPlacement(0, 'loss-walls').anchor).toBe('start');
    expect(lossPlacement(180, 'loss-walls').anchor).toBe('end');
  });

  it('separates the two down-pointing floor arrows', () => {
    const ground = lossPlacement(90, 'loss-ground-floor');
    const exposed = lossPlacement(90, 'loss-exposed-floor');
    expect(Math.sign(ground.dx)).toBe(-Math.sign(exposed.dx));
  });

  it('holds every label within a short reach of its own anchor', () => {
    // The point of the change: a small loss draws a stub of an arrow and its
    // name must still be attached to the surface, not stranded 200 units out
    // where the longest possible arrow would have ended.
    for (const type of BUILDING_TYPES) {
      for (const anchor of type.anchors) {
        if (!anchor.slot.startsWith('loss-')) continue;
        const { dx, dy } = lossPlacement(anchor.rotate, anchor.slot);
        expect(Math.hypot(dx, dy), `${type.id}/${anchor.slot}`).toBeLessThan(40);
      }
    }
  });
});
