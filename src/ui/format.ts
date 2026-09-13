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
