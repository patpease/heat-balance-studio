import type { HourResult } from '../engine/balance';
import type { SurfaceSlot } from '../model/types';

/**
 * One colour per component, for the detailed chart.
 *
 * The palette itself lives in `ui/tokens.css`, where the derivation is written
 * out: hues solved in CIE LCh for maximum perceptual separation subject to both
 * themes clearing contrast, rather than picked by eye. This file only says
 * which slot takes which.
 *
 * **Every token here must also exist in `io/exportPng.ts`'s `LIGHT_TOKENS`.**
 * The export resolves `var()` against that map by hand, and a token missing
 * from it survives into the exported SVG as a literal `var(--s-roof)`, which
 * paints nothing — a PNG quietly missing a line, from a chart that looked
 * correct on screen. There is a test.
 */
export const SERIES_COLOUR: Record<SurfaceSlot, string> = {
  'loss-walls': 'var(--s-walls)',
  'loss-windows': 'var(--s-windows)',
  'loss-roof': 'var(--s-roof)',
  'loss-ground-floor': 'var(--s-ground-floor)',
  'loss-exposed-floor': 'var(--s-exposed-floor)',
  'loss-infiltration': 'var(--s-infiltration)',
  'loss-ventilation': 'var(--s-ventilation)',
  'gain-people': 'var(--s-people)',
  'gain-lighting': 'var(--s-lighting)',
  'gain-misc-equipment': 'var(--s-misc)',
  'gain-it-equipment': 'var(--s-it)',
};

export interface Series {
  readonly slot: SurfaceSlot;
  readonly label: string;
  readonly colour: string;
  readonly kind: 'loss' | 'gain';
  /** 24 values, already in display units. */
  readonly values: readonly number[];
  /** The largest hour by MAGNITUDE, which is what the series are ordered by. */
  readonly peak: number;
}

/**
 * Pull one series per component out of the hourly results.
 *
 * **Losses come back NEGATIVE.** The engine reports every term as a positive
 * magnitude and lets its slot say which direction it points, which is right for
 * a table; on a chart it is not, because a reader has to consult a legend to
 * learn that a rising line means the building is getting colder. The sign
 * convention the rest of the tool already uses — a negative net is a building
 * that is short — puts gains above zero and losses below, and then the
 * direction is the thing you see first.
 *
 * **A component that is zero in all 24 hours is dropped.** Every building has
 * an exposed-floor row and almost none has an exposed floor; a flat line along
 * the axis is a legend entry and a colour spent on nothing. The same goes for
 * IT equipment, which is zero until somebody enters a load.
 *
 * Ordered by magnitude, largest first, so the legend reads as a ranking and the
 * drawing order is stable as the numbers move — reordering lines under a
 * hovering pointer would be worse than any occlusion it avoids. Magnitude
 * rather than value, or every loss would sort below every gain and the ranking
 * would be two rankings.
 */
export function seriesFrom(
  hours: readonly HourResult[],
  scale: (watts: number) => number,
): readonly Series[] {
  const collected = new Map<SurfaceSlot, { label: string; kind: 'loss' | 'gain'; values: number[] }>();

  hours.forEach((hour, index) => {
    for (const [kind, terms] of [
      ['loss', hour.lossTerms],
      ['gain', hour.gainTerms],
    ] as const) {
      for (const term of terms) {
        let entry = collected.get(term.slot);
        if (!entry) {
          entry = { label: term.label, kind, values: new Array<number>(hours.length).fill(0) };
          collected.set(term.slot, entry);
        }
        // The one place the sign is applied. Everything downstream — ordering,
        // the axis, the readout — works on signed values from here.
        entry.values[index] = scale(kind === 'loss' ? -term.watts : term.watts);
      }
    }
  });

  return [...collected.entries()]
    .map(([slot, entry]) => ({
      slot,
      label: entry.label,
      kind: entry.kind,
      colour: SERIES_COLOUR[slot],
      values: entry.values,
      peak: Math.max(...entry.values.map((v) => Math.abs(v))),
    }))
    .filter((series) => series.peak > 0)
    .sort((a, b) => b.peak - a.peak);
}
