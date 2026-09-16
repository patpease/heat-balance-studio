import type { UnitSystem } from '../model/types';
import { toBtuH } from '../model/units';

/**
 * Number display.
 *
 * One helper, because a thousands separator applied in some places and not
 * others is worse than none at all: a reader who sees `6,000` in one column and
 * `24000` in the next has to stop and work out whether the second one is a
 * different quantity.
 *
 * `en-US` is pinned rather than left to the visitor's locale. The tool is
 * written in English with a full stop for the decimal point throughout — the
 * input fields parse that way, `Number()` parses that way — and a German locale
 * would render 6.000 into a field that then reads it back as six.
 */

/** A number for reading: grouped above a thousand, fixed to `decimals`. */
export function grouped(value: number, decimals = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * A number for editing: the same value with no separators.
 *
 * The field swaps to this on focus. Typing into a grouped string means the
 * caret jumps every time a comma appears or disappears, and it means parsing
 * back through whatever half-formed thing is on screen mid-edit.
 */
export function plain(value: number, decimals = 0): string {
  return value.toFixed(decimals);
}

/**
 * Read a number back, separators and all.
 *
 * Grouping is stripped rather than rejected because a pasted figure carries the
 * commas of wherever it was copied from, and refusing `6,000` would be a
 * silent-looking failure — the field would simply snap back.
 */
export function parseGrouped(text: string): number {
  return Number(text.replace(/,/g, '').trim());
}

/**
 * A heat FLOW, in the displayed system, with a prefix that suits its size.
 *
 * The recovery figures span three orders of magnitude — a comms closet makes
 * about 5 kW and a data hall 514 — and neither a fixed `kW` nor a fixed `W`
 * reads well across that. Worse, the verdict was quoting kW while every other
 * heat flow on the page was in the displayed system, so a reader in IP had one
 * number in Btu/h and the one beside it in kW.
 *
 * So: convert first, then choose the prefix from the magnitude. A thousand is
 * the switch, and the decimal goes away once the figure is big enough not to
 * need it.
 */
export function heatFlow(watts: number, units: UnitSystem): string {
  const value = units === 'IP' ? toBtuH(watts) : watts;
  const unit = units === 'IP' ? 'Btu/h' : 'W';
  const magnitude = Math.abs(value);

  if (magnitude < 1000) return `${grouped(value)} ${unit}`;
  const thousands = value / 1000;
  return `${grouped(thousands, Math.abs(thousands) >= 100 ? 0 : 1)} k${unit}`;
}
