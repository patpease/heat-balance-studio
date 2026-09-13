/**
 * "Sketch a box" — five dimensions in, five surface areas out.
 *
 * Typing five areas by hand is exactly the spreadsheet feeling this tool exists
 * to avoid, and at the stage where the tool is useful most people have a box in
 * mind rather than a takeoff. So: length, width, storey height, storeys and a
 * window-to-wall ratio, and the areas fall out.
 *
 * Everything it produces stays editable afterwards. This is a starting point,
 * not a mode — a user who knows their real wall area should be able to type it
 * over the top without leaving the helper first.
 *
 * v2 runs this backwards from a wall-to-floor ratio, height and shape. The
 * relationship is the same one; only which side is known changes.
 */

export interface BoxDimensions {
  /** m */
  readonly length: number;
  readonly width: number;
  /**
   * OVERALL height of the building, not the height of one storey.
   *
   * Asking for the total is the dimension someone actually has in an early
   * sketch — a four-storey building is "about 14 metres", not "3.5 metres,
   * four times". The per-storey height is height/storeys and is derived, never
   * shown.
   */
  readonly height: number;
  readonly storeys: number;
  /** 0–1, fraction of gross wall that is glazed. */
  readonly windowToWallRatio: number;
}

export interface BoxAreas {
  /** m², gross conditioned. */
  readonly floorArea: number;
  /** m², opaque wall only — the glazing is already taken out. */
  readonly wallArea: number;
  readonly windowArea: number;
  readonly roofArea: number;
  readonly groundFloorArea: number;
  /** Always zero: a simple box has no floor over outside air. */
  readonly exposedFloorArea: number;
  /** m. Derived, never shown — the overall height divided by the storeys. */
  readonly storeyHeight: number;
  /** Derived and shown, because it is a headline metric in its own right. */
  readonly wallToFloorRatio: number;
}

export const DEFAULT_BOX: BoxDimensions = {
  length: 50,
  width: 30,
  height: 14,
  storeys: 4,
  windowToWallRatio: 0.3,
};

export function areasFromBox(box: BoxDimensions): BoxAreas {
  const length = Math.max(0, box.length);
  const width = Math.max(0, box.width);
  const height = Math.max(0, box.height);
  const storeys = Math.max(1, Math.round(box.storeys));
  const wwr = Math.min(1, Math.max(0, box.windowToWallRatio));

  const footprint = length * width;
  const floorArea = footprint * storeys;
  const perimeter = 2 * (length + width);
  // Height is the whole building, so the wall is the perimeter times it. The
  // old form multiplied a per-storey height BY the storeys to reach the same
  // number; this says it once.
  const grossWall = perimeter * height;

  // Roof and ground floor are each ONE footprint however many storeys there
  // are. Multiplying them by storeys is the obvious slip, and it would roughly
  // double the envelope of a tall building.
  return {
    floorArea,
    wallArea: grossWall * (1 - wwr),
    windowArea: grossWall * wwr,
    roofArea: footprint,
    groundFloorArea: footprint,
    exposedFloorArea: 0,
    storeyHeight: storeys > 0 ? height / storeys : height,
    wallToFloorRatio: floorArea > 0 ? grossWall / floorArea : 0,
  };
}
