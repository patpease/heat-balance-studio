/**
 * Conductance, and the loss terms it produces.
 *
 * **Each surface produces its own labelled loss term rather than contributing
 * to a single UA.** That is the one architectural commitment v1 makes on v2's
 * behalf, and it costs nothing now: a ventilation term is a push onto an array
 * instead of surgery on the core, and the chart's stacked breakdown comes free
 * because the terms are already named and separate.
 *
 * Two driving temperatures, not one:
 *
 *  - **Air-coupled** surfaces track the design day hour by hour.
 *  - **Ground-coupled** surfaces are driven by a CONSTANT ground temperature.
 *    Driving a slab with outdoor air is wrong in a way that matters on the
 *    coldest hour of the year — in the worked example it invents 2,475 W of
 *    loss, about a third of the whole heating deficit.
 */

import { GROUND_DRIFT_LIMIT_K, GROUND_RULE_OF_THUMB_C } from '../model/defaults';
import type {
  Conditions,
  Envelope,
  GroundTemperatureBasis,
  Surface,
  SurfaceSlot,
} from '../model/types';

/** Where a surface category's arrow lives on the drawing. */
const SLOT_BY_CATEGORY: Record<Surface['category'], SurfaceSlot> = {
  wall: 'loss-walls',
  window: 'loss-windows',
  roof: 'loss-roof',
  groundFloor: 'loss-ground-floor',
  exposedFloor: 'loss-exposed-floor',
};

export interface LossTerm {
  readonly slot: SurfaceSlot;
  readonly label: string;
  /** W/K */
  readonly conductance: number;
  /** Air-coupled terms vary by hour; ground-coupled ones do not. */
  readonly driver: 'air' | 'ground';
}

/**
 * UA for one surface: area × U × b.
 *
 * `b` is the temperature-difference factor — 1 for a surface facing outdoor
 * air, 0–1 for one facing an unconditioned buffer. v1 pins it at 1 and offers
 * no buffer boundary; the engine applies it anyway so that exposing it later is
 * a UI change and not a model change.
 *
 * It is deliberately NOT applied to a ground-coupled surface, which takes a
 * different driving temperature instead.
 */
export function surfaceConductance(surface: Surface): number {
  const b = surface.boundary === 'ground' ? 1 : surface.bufferFactor;
  return surface.area * surface.uValue * b;
}

/** One labelled term per surface, in the envelope's own order. */
export function lossTerms(envelope: Envelope): LossTerm[] {
  return envelope.surfaces.map((surface) => ({
    slot: SLOT_BY_CATEGORY[surface.category],
    label: surface.label,
    conductance: surfaceConductance(surface),
    driver: surface.boundary === 'ground' ? ('ground' as const) : ('air' as const),
  }));
}

export interface Conductance {
  /** W/K, surfaces that track the outdoor air. */
  readonly air: number;
  /** W/K, surfaces driven by the constant ground temperature. */
  readonly ground: number;
  /** W/K, everything. */
  readonly total: number;
  readonly terms: readonly LossTerm[];
}

export function conductance(envelope: Envelope): Conductance {
  const terms = lossTerms(envelope);
  let air = 0;
  let ground = 0;
  for (const term of terms) {
    if (term.driver === 'ground') ground += term.conductance;
    else air += term.conductance;
  }
  return { air, ground, total: air + ground, terms };
}

/**
 * Wall-to-floor ratio: gross exterior wall area, INCLUDING glazing, over gross
 * conditioned floor area.
 *
 * Including glazing is the choice worth stating, because both conventions are
 * in circulation. Wall-to-floor is a *massing* metric — how much envelope the
 * plan buys per unit of floor — and at the point in design where this tool is
 * useful, whether a given square metre of that envelope is glass or opaque is a
 * later decision. The glazing fraction stays visible separately as the window
 * row's share of conductance, so nothing is lost by keeping the two apart.
 *
 * It is also the geometric statement of this tool's whole thesis: floor area
 * makes internal gain, wall area loses heat.
 */
export function wallToFloorRatio(envelope: Envelope): number {
  if (envelope.floorArea <= 0) return 0;
  const wall = envelope.surfaces
    .filter((s) => s.category === 'wall' || s.category === 'window')
    .reduce((sum, s) => sum + s.area, 0);
  return wall / envelope.floorArea;
}

export interface ResolvedGroundTemperature {
  /** °C */
  readonly value: number;
  readonly basis: GroundTemperatureBasis;
  /** K from the rule of thumb — what the decision turned on. */
  readonly drift: number;
}

/**
 * Pick a ground temperature rather than asking the user to.
 *
 * 55 °F held constant is the recognised rule of thumb and it is close enough
 * across the temperate band — against a location-derived value it moves
 * Boston's worst-hour deficit by about 2%. Where a number does not change the
 * result, the one people already recognise is the better number.
 *
 * But it fails at both ends, and in cold climates it fails FLATTERINGLY: 55 °F
 * is warmer than the real ground in Minneapolis (4.7 K) and would understate
 * slab loss in exactly the places where a heating-free claim is hardest to
 * earn. Phoenix and Miami fail the other way, where 55 °F invents a slab loss
 * that is really a gain.
 *
 * So beyond 3 K of drift the site's own annual mean air temperature takes over,
 * and the field names whichever basis it resolved to.
 */
export function resolveGroundTemperature(
  annualMeanTemperature: number,
): ResolvedGroundTemperature {
  const drift = Math.abs(annualMeanTemperature - GROUND_RULE_OF_THUMB_C);
  return drift <= GROUND_DRIFT_LIMIT_K
    ? { value: GROUND_RULE_OF_THUMB_C, basis: 'rule-of-thumb', drift }
    : { value: annualMeanTemperature, basis: 'derived', drift };
}

/** The constant loss through every ground-coupled surface, W. */
export function groundLoss(envelope: Envelope, conditions: Conditions): number {
  const { ground } = conductance(envelope);
  return ground * (conditions.indoorSetpoint - conditions.groundTemperature);
}
