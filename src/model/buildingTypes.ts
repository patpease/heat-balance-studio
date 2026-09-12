/**
 * Building types, as DATA.
 *
 * The section drawing is never inline JSX. A `BuildingType` holds the massing
 * paths, the ground, the occupant glyphs and one anchor per arrow slot, and
 * `SectionDrawing` renders whichever record it is handed. v1 ships one; v2 adds
 * the other five from the massing canvas and a picker, and the renderer does not
 * change at all.
 *
 * The geometry below was extracted from `Building Massings Dark.dc.html` rather
 * than retyped, and the coordinate frame is the canvas's own — so a future
 * re-export drops straight in. Path data is identical between the light and
 * dark canvases (checked, not assumed); only the strokes differ, and those come
 * from tokens.
 *
 * `data-surface` in the canvas and `SurfaceSlot` here are the same names on
 * purpose. That is the contract between the drawing and the engine.
 */

import type { ArrowAnchor, BuildingType, MassingPath } from './types';

const OFFICE_SHELL: MassingPath[] = [
  // Outer massing: four storeys, flat roof.
  { d: 'M176 454 C 173 380 179 290 176 208 C 254 205 340 211 424 208 C 508 205 576 211 636 208 C 633 290 639 380 636 454 C 566 457 494 451 424 454 C 342 457 250 451 176 454 Z', role: 'shell' },
  // Roof line, oversailing the walls slightly.
  { d: 'M164 208 C 264 205 366 211 466 208 C 534 206 588 210 648 208', role: 'shell' },
  // Ground-floor slab.
  { d: 'M176 454 C 250 451 342 457 424 454 C 494 451 566 457 636 454', role: 'shell' },
  { d: 'M177 466 C 251 463 342 469 424 466 C 494 463 565 469 635 466', role: 'floor-line' },
  { d: 'M176 290 C 250 287 342 293 424 290 C 494 287 566 293 636 290', role: 'floor-line' },
  { d: 'M176 372 C 250 369 342 375 424 372 C 494 369 566 375 636 372', role: 'floor-line' },
  // Glazing, two east and one west.
  { d: 'M636 236 C 610 233 584 239 558 236 C 555 254 561 266 558 278 C 584 281 610 275 636 278', role: 'aperture' },
  { d: 'M636 318 C 610 315 584 321 558 318 C 555 336 561 348 558 360 C 584 363 610 357 636 360', role: 'aperture' },
  { d: 'M176 236 C 200 233 224 239 248 236 C 245 254 251 266 248 278 C 224 281 200 275 176 278', role: 'aperture' },
];

const OFFICE_GLYPHS: MassingPath[] = [
  // A person: head is drawn separately as a circle by the renderer.
  { d: 'M300 411 C 301 422 299 430 300 438 M288 418 C 293 415 307 415 312 418 M300 438 L 292 452 M300 438 L 308 452', role: 'glyph' },
  // Pendant light.
  { d: 'M420 230 C 421 244 419 254 420 262', role: 'glyph-light' },
  { d: 'M406 276 C 409 267 414 262 420 262 C 426 262 431 267 434 276 C 425 278 415 274 406 276 Z', role: 'glyph' },
  // Misc equipment.
  { d: 'M460 412 C 474 409 488 415 502 412 C 499 422 505 430 502 440 C 488 443 474 437 460 440 C 463 430 457 422 460 412 Z', role: 'glyph' },
  // IT rack. Not on the canvas — added with the ninth arrow, so the IT term
  // has something to leave from rather than sharing the equipment box.
  { d: 'M548 402 C 562 399 576 405 590 402 C 587 414 593 426 590 438 C 576 441 562 435 548 438 C 551 426 545 414 548 402 Z', role: 'glyph' },
  { d: 'M556 412 L 582 412 M556 421 L 574 421 M556 430 L 578 430', role: 'glyph-light' },
];

/**
 * One anchor per slot.
 *
 * `rotate` is the direction heat actually travels: losses point out of the
 * building, gains point up into it. The canvas draws eight; the ninth —
 * `gain-it-equipment` — is added here, since the canvas predates the misc/IT
 * split. It sits beside the equipment glyph and points the same way, because at
 * the hour the verdict is decided it is usually the only gain arrow drawn.
 */
const OFFICE_ANCHORS: ArrowAnchor[] = [
  { slot: 'loss-walls', x: 176, y: 336, rotate: 180 },
  { slot: 'loss-windows', x: 636, y: 258, rotate: 0 },
  { slot: 'loss-roof', x: 400, y: 202, rotate: -90 },
  { slot: 'loss-ground-floor', x: 470, y: 470, rotate: 90 },
  { slot: 'loss-exposed-floor', x: 222, y: 470, rotate: 90 },
  { slot: 'gain-people', x: 300, y: 396, rotate: -108 },
  { slot: 'gain-lighting', x: 406, y: 272, rotate: 174 },
  { slot: 'gain-misc-equipment', x: 481, y: 406, rotate: -72 },
  { slot: 'gain-it-equipment', x: 566, y: 424, rotate: -62 },
];

export const OFFICE: BuildingType = {
  id: 'office',
  label: 'Office',
  viewBox: '-130 12 1110 566',
  shell: OFFICE_SHELL,
  glyphs: OFFICE_GLYPHS,
  soil: [
    { x: 270, y: 454, width: 610, height: 346 },
    { x: -120, y: 556, width: 1000, height: 244 },
  ],
  anchors: OFFICE_ANCHORS,
  defaultSpaceType: 'office-open',
};

/** The grade line, drawn over the soil hatch. Shared by every massing. */
export const OFFICE_GROUND_LINE =
  'M880 455 C 640 452 520 457 400 454 C 366 453 300 456 271 454 L 270 500 C 273 528 267 542 270 557 C 180 554 90 559 -120 556';

/** A person's head, which the glyph path deliberately leaves out. */
export const OFFICE_PERSON_HEAD = { cx: 300, cy: 404, r: 7 } as const;

/**
 * v1 ships one. The other five are drawn on the canvas and land in v2 — this
 * array is what the picker will iterate, and it already works with one entry.
 */
export const BUILDING_TYPES: readonly BuildingType[] = Object.freeze([OFFICE]);

export function buildingType(id: BuildingType['id']): BuildingType {
  return BUILDING_TYPES.find((t) => t.id === id) ?? OFFICE;
}
