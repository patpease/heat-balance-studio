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

import type { AirLeakage } from './airtightness';
import type { Ventilation } from './ventilation';

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
  /**
   * How leaky the construction is, as a grade rather than a number.
   *
   * A property of the envelope, not of the weather and not of the occupants:
   * it is decided by what gets specified and detailed. See
   * `model/airtightness.ts` for the three grades and what each is anchored to.
   */
  readonly airtightness: AirLeakage;
}

// ---------------------------------------------------------------------------
// Internal gains
// ---------------------------------------------------------------------------

/**
 * Where IT heat goes, which is the whole question about IT heat.
 *
 * This replaced φ — a hidden `spaceFraction` held at 1.0, meaning every watt
 * of IT power warmed the room. That was defensible while the presets were a
 * fraction of a W/m²; with a 400 kW data hall it asserted 400 kW of free space
 * heat and flipped the verdict on its own, against a tooltip that said the
 * opposite. A fraction was also the wrong SHAPE of control: the real question
 * is not "how much of it leaks into the room" but "what is cooling it", and a
 * user knows the answer to the second.
 *
 *   air            No dedicated cooling. The heat warms the room, and it is a
 *                  passive gain like any other. A comms closet.
 *   chilled-water  A chilled-water loop takes the heat. It does NOT warm the
 *                  room — but a heat recovery chiller can turn it into heating
 *                  hot water for the rest of the building. Not passive, and
 *                  not lost either.
 *   rejected       Straight outdoors, through a dry cooler or a packaged unit
 *                  with no recovery. Worth nothing to this building.
 */
export type ItCooling = 'air' | 'chilled-water' | 'rejected';

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
  /**
   * IT equipment, as an ABSOLUTE load in kilowatts — not a density.
   *
   * Every other gain in this tool scales with floor area, because every other
   * gain is spread through the building: double the floor and you double the
   * lights, the people and the laptops. IT does not work that way. A server
   * room is a room with racks in it, and the racks do not multiply because the
   * building around them got bigger — the same 50 kW room in a 2,000 m² office
   * and a 20,000 m² one is the same 50 kW.
   *
   * Held as a density, that error was invisible and one-directional: a user who
   * sized their IT load against their building and then enlarged the building
   * got ten times the IT heat, silently, in the term that runs 24/7 and decides
   * the overnight verdict.
   *
   * The field is named for its unit for the same reason `toF` and `deltaToF`
   * are separate functions. It was `powerDensity` and it is not one.
   */
  readonly itEquipment: {
    /**
     * kW of IT equipment in the building. NOT per unit area.
     *
     * The same number in both unit systems: kW is kW. There is no
     * `toKilowatts` and there must not be one — a conversion here would be a
     * bug with no symptom, since the value would still look plausible.
     */
    readonly kilowatts: number;
    /** How the heat leaves the equipment, which decides what it is worth. */
    readonly cooling: ItCooling;
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
  /**
   * Which building type these numbers CAME from, whatever has happened since.
   *
   * `preset` answers "are these still the published values?" and goes null on
   * the first edit — that is the badge contract and it does not change. This
   * answers "which building is this?", and an edit does not change the answer:
   * a warehouse with one density typed over is still a warehouse. It is what
   * keeps the section drawing on the massing the user picked instead of
   * snapping back to the office the moment they touch a field.
   */
  readonly sourceId: string | null;
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
  /**
   * 1–12: the month the cold days cluster in, and the month the ground
   * temperature is read from. 0 only on a link written before this existed.
   */
  readonly designMonth: number;
  /**
   * °C — the record's mean for that month, across every year of it.
   *
   * This replaced the ANNUAL mean, which was 15 °F too warm for Houston:
   * measured soil there sits at 54–56 °F in January while the annual mean air
   * temperature is 70 °F. Soil follows the season, not the year.
   */
  readonly designMonthMeanTemperature: number;
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
  /**
   * Site elevation, m. Carried here so the solver can thin the air.
   *
   * Infiltration heat loss is ρ·V̇·c_p, and ρ falls with altitude — Denver at
   * 1,600 m loses 18% less heat per unit of leakage than the same building at
   * sea level. The geocoder already returns elevation, so the alternative was
   * to have it and not use it.
   */
  readonly siteElevation: number;
  /**
   * Hold the design day flat at its minimum for all 24 hours.
   *
   * Off by default, and off is the honest screen: a real cold day has a diurnal
   * swing, and averaging it away understates the daytime gains that make a
   * building self-heating. It exists because the ASHRAE heating design day IS
   * isothermal by convention, so a load calculation someone wants to check this
   * against was sized on a flat day. Without the toggle the two numbers differ
   * and neither party knows why.
   *
   * A condition of the analysis rather than a property of the weather: the
   * derived `DesignDay` keeps its real profile and its provenance, and this
   * says what to do with it.
   */
  readonly flatDesignDay: boolean;
}

// ---------------------------------------------------------------------------
// Ventilation — v2. Absent from every v1 file.
// ---------------------------------------------------------------------------

/**
 * Reserved in v1 and superseded when it was built.
 *
 * The real shape is in `model/ventilation.ts`. Three things the reservation got
 * wrong, all of them only visible once there was a UI to put it behind:
 *
 *  - `mode` as a one-of. 62.1 sizes a zone as per-person PLUS per-area, not one
 *    or the other — a space with nobody in it still ventilates for its finishes.
 *  - `infiltrationAch` living here. Infiltration is uncontrolled and nothing can
 *    be recovered from it; it belongs to the envelope, and that is where it went.
 *  - `schedule` as a full 24-value `Schedule`. A fan runs constantly or follows
 *    the people, and offering 24 draggable bars for a two-way choice is a way of
 *    asking a question nobody has that much of an answer to.
 */
export type ReservedVentilationV1 = never;

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
   * A v1 file simply does not carry the key and it reads as
   * `?? DEFAULT_VENTILATION` — so there was no migration, as promised.
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
  | 'loss-infiltration'
  | 'loss-ventilation'
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
