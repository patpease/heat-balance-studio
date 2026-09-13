/**
 * The project file format, and every type the engine works in.
 *
 * Two rules run through all of it:
 *
 *  1. **Canonical SI, converted at the display edge.** Watts, kelvin, square
 *     metres, W/m²K, degrees Celsius. IP is a display transform and never a
 *     storage format. The one place this is easy to get wrong is the U ⇄ R
 *     field, because the conversion is a reciprocal — it has its own test.
 *
 *  2. **Positive loss is outward, positive gain is inward, net is gain minus
 *     loss.** A positive net means the space is self-heating in that hour.
 */

export type UnitSystem = 'IP' | 'SI';

/** IP is what a US user first sees; storage stays SI regardless. */
export const DEFAULT_UNITS: UnitSystem = 'IP';

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export type SurfaceCategory =
  | 'wall'
  | 'window'
  | 'roof'
  | 'groundFloor'
  | 'exposedFloor';

/**
 * What a surface faces.
 *
 * `'buffer'` exists in the type but is unreachable in v1: the UI offers no
 * buffer option and `bufferFactor` is pinned at 1. A wall to an unheated garage
 * gets entered as an outdoor wall, which overstates its loss — the conservative
 * direction, and disclosed in the stated assumptions rather than left implicit.
 */
export type Boundary = 'air' | 'ground' | 'buffer';

export type Orientation =
  | 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'
  | 'horizontal';

export interface Surface {
  readonly id: string;
  readonly category: SurfaceCategory;
  /** "Walls", or "South glazing" once a category is split in v3. */
  readonly label: string;
  /** m² */
  readonly area: number;
  /** W/m²K, canonical. R is a display transform. */
  readonly uValue: number;
  readonly boundary: Boundary;
  /**
   * Temperature-difference factor b, 0–1. Always 1 in v1; the engine applies
   * it so that exposing it later is a UI change and not a model change.
   */
  readonly bufferFactor: number;
  /** v3 reserves these. v1 writes null. */
  readonly orientation: Orientation | null;
  readonly shgc: number | null;
}

export interface Envelope {
  /** m², gross conditioned. The denominator of every W/m² in the tool. */
  readonly floorArea: number;
  /** m. Unused in v1 — captured so v2 can compute volume without re-asking. */
  readonly storeyHeight: number;
  readonly storeys: number;
  /**
   * Exactly five at first, one per category. An array rather than five named
   * fields so that v3 can split glazing by orientation with no migration: the
   * UI groups by `category` and sums. Five categories is a presentation
   * commitment, not a storage one.
   */
  readonly surfaces: readonly Surface[];
}

// ---------------------------------------------------------------------------
// Internal gains
// ---------------------------------------------------------------------------

export interface Schedule {
  readonly id: string;
  readonly name: string;
  readonly source: 'preset' | 'custom';
  /** Exactly 24, each 0–1. Hour 0 is 00:00–01:00 local standard time. */
  readonly fractions: readonly number[];
}

export interface Gains {
  readonly occupancy: {
    readonly mode: 'density' | 'count';
    /** m² per person, used when mode is 'density'. */
    readonly areaPerPerson: number;
    readonly count: number;
    /** W per person, SENSIBLE only — this tool has no latent side. */
    readonly sensiblePerPerson: number;
  };
  /** W/m² */
  readonly lighting: { readonly powerDensity: number };
  /** W/m² — laptops, printers, fridges. Follows occupancy with a standby floor. */
  readonly miscEquipment: { readonly powerDensity: number };
  readonly itEquipment: {
    /** W/m² of building area — server rooms, IDF closets, data halls. */
    readonly powerDensity: number;
    /**
     * φ: the share of IT power released into the conditioned space. A data
     * hall on its own cooling rejects its heat outdoors and warms nothing.
     * v1 holds this at 1 and shows no control; the assumption is disclosed
     * instead, because the user cannot change it.
     */
    readonly spaceFraction: number;
  };
  readonly schedules: {
    readonly occupancy: Schedule;
    readonly lighting: Schedule;
    readonly miscEquipment: Schedule;
    /** Defaults to the flat 24/7 preset. IT is the point of the split. */
    readonly itEquipment: Schedule;
  };
  /** Names the source preset. Goes null the moment any value is edited. */
  readonly preset: string | null;
}

// ---------------------------------------------------------------------------
// Site, weather, conditions
// ---------------------------------------------------------------------------

export interface Site {
  /** "Boston, Massachusetts" as the user will recognise it. */
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  /** m */
  readonly elevation: number;
  /** IANA, from the geocoder. */
  readonly timezone: string;
  readonly source: 'geocoded' | 'epw' | 'manual';
}

export interface DesignHour {
  /** 0–23, local standard time. */
  readonly hour: number;
  /** °C */
  readonly tdb: number;
  /** v3 reserves these three. v1 writes null. */
  readonly ghi: number | null;
  readonly dni: number | null;
  readonly dhi: number | null;
}

export type DesignDayBasis =
  | 'era5-percentile'
  | 'ddy-99.6'
  | 'epw-percentile'
  | 'manual';

export interface DesignDay {
  readonly basis: DesignDayBasis;
  /** 0.4 or 1.0 for a derived basis; null otherwise. */
  readonly percentile: number | null;
  readonly yearsOfRecord: readonly [number, number] | null;
  /** °C — the anchor. The profile's lowest hour equals this exactly. */
  readonly minimum: number;
  /** K */
  readonly dailyRange: number;
  /** Exactly 24. */
  readonly hours: readonly DesignHour[];
  /** °C — feeds the ground-temperature resolver. */
  readonly annualMeanTemperature: number;
  /** Human-readable, stamped on every export. A number whose source cannot be
   *  traced is a number someone will eventually misquote. */
  readonly provenance: string;
}

export type GroundTemperatureBasis = 'rule-of-thumb' | 'derived' | 'manual';

export interface Conditions {
  /** °C canonical. Default 21.111… — i.e. 70 °F exactly. */
  readonly indoorSetpoint: number;
  /** °C — resolved by resolveGroundTemperature(). */
  readonly groundTemperature: number;
  readonly groundTemperatureBasis: GroundTemperatureBasis;
}

// ---------------------------------------------------------------------------
// Ventilation — v2. Absent from every v1 file.
// ---------------------------------------------------------------------------

export interface Ventilation {
  readonly mode: 'perPerson' | 'perArea' | 'ach';
  readonly rate: number;
  /** Sensible effectiveness of heat recovery, 0–1. */
  readonly recoveryEffectiveness: number;
  readonly infiltrationAch: number;
  readonly schedule: Schedule;
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface ProjectMeta {
  readonly name: string;
  readonly notes: string;
  /** ISO 8601 */
  readonly created: string;
  readonly modified: string;
}

export interface Project {
  readonly schemaVersion: 1;
  readonly meta: ProjectMeta;
  /** Display only; storage is always SI. */
  readonly units: UnitSystem;
  readonly buildingType: BuildingTypeId;
  readonly site: Site;
  readonly designDay: DesignDay;
  readonly conditions: Conditions;
  readonly envelope: Envelope;
  readonly gains: Gains;
  /**
   * v2. A v1 file simply does not carry the key, and v2 reads it as
   * `?? DEFAULT_VENTILATION` — so there is no migration.
   */
  readonly ventilation?: Ventilation | null;
}

// ---------------------------------------------------------------------------
// Building type and its massing
// ---------------------------------------------------------------------------

export type BuildingTypeId =
  | 'office'
  | 'school'
  | 'lab'
  | 'civic'
  | 'multifamily'
  | 'home';

/**
 * The slots an arrow can occupy. These match the `data-surface` attribute the
 * design canvases carry, which is the contract that lets one renderer drive any
 * massing.
 *
 * Nine, where the canvas draws eight: the canvas predates the misc/IT split.
 */
export type SurfaceSlot =
  | 'loss-walls'
  | 'loss-windows'
  | 'loss-roof'
  | 'loss-ground-floor'
  | 'loss-exposed-floor'
  | 'gain-people'
  | 'gain-lighting'
  | 'gain-misc-equipment'
  | 'gain-it-equipment';

export interface ArrowAnchor {
  readonly slot: SurfaceSlot;
  /** Origin of the 88-unit shaft, in massing coordinates. */
  readonly x: number;
  readonly y: number;
  /** Degrees. The direction heat actually travels. */
  readonly rotate: number;
}

export interface MassingPath {
  readonly d: string;
  readonly role:
    | 'shell'
    | 'shell-light'
    | 'aperture'
    | 'floor-line'
    | 'ground-line'
    | 'glyph'
    | 'glyph-light';
}

/**
 * A building type is DATA, not markup.
 *
 * v1 ships one of these and renders through it. v2 adds five more records and a
 * picker, and the renderer does not change — which is the whole reason for the
 * indirection, since hard-coding the section as JSX would make v2 a rewrite.
 */
export interface BuildingType {
  readonly id: BuildingTypeId;
  readonly label: string;
  readonly viewBox: string;
  readonly shell: readonly MassingPath[];
  readonly glyphs: readonly MassingPath[];
  readonly soil: readonly { x: number; y: number; width: number; height: number }[];
  readonly anchors: readonly ArrowAnchor[];
}
