import { useState } from 'react';
import type { CSSProperties } from 'react';

import { grouped, parseGrouped, plain } from './format';

export const cellStyle: CSSProperties = {
  textAlign: 'right',
  padding: '2px 0',
  borderBottom: '1px solid var(--border)',
  fontVariantNumeric: 'tabular-nums',
};

/**
 * A number you can type into.
 *
 * **Commits on blur and on Enter, never per keystroke.** Committing per
 * character means typing `0.2` passes through the intermediate value `0` — and
 * a zero U-value throws out of `uToR`, while a zero area silently blanks a
 * surface halfway through an edit. The draft is local; the store only hears
 * about finished numbers.
 *
 * **Grouped at rest, and never reformatted while you type.** A six thousand
 * square metre floor reads as `6,000`, and the field keeps that exact string
 * when it takes focus — the draft is free text from then until blur, and only
 * `parseGrouped` has an opinion about the commas in it.
 *
 * The field used to swap to an unseparated `6000` on focus, on the reasoning
 * that formatting as you type moves the caret. That reasoning is right and the
 * fix was wrong: changing a controlled input's value during its own focus event
 * discards the caret the click just set, so clicking at the end of a number to
 * append a digit put the caret at position 0 and typed the digit on the front.
 * Not swapping at all costs nothing and keeps the caret exactly where the user
 * put it.
 *
 * The price is that a half-deleted number can show a comma in a silly place
 * until blur. That is visible, momentary, and cannot corrupt anything —
 * unlike a caret that silently moved.
 *
 * `draft` doubles as the edit flag: `null` means nobody is typing, so the field
 * shows the stored value and follows it when something else moves it — editing
 * R rewrites U, and the box helper rewrites every row at once. That fallback
 * replaces an effect that used to copy the value into state on every change.
 */
export function NumberCell({
  value,
  decimals,
  onCommit,
  label,
  style,
}: {
  readonly value: number;
  readonly decimals: number;
  readonly onCommit: (next: number) => void;
  /** Announced to a screen reader. "Windows U-value", not "value". */
  readonly label: string;
  /** Merged over the base. The sketch-box fields are boxed rather than flush,
   *  but the draft-and-commit behaviour must not be forked to get that. */
  readonly style?: CSSProperties;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const parsed = parseGrouped(draft ?? plain(value, decimals));
    setDraft(null);
    if (Number.isFinite(parsed)) onCommit(parsed);
  };

  return (
    <input
      value={draft ?? grouped(value, decimals)}
      inputMode="decimal"
      aria-label={label}
      // Seeds the draft with the string ALREADY on screen. Anything else is a
      // value change during focus, which is what moved the caret.
      onFocus={() => setDraft(grouped(value, decimals))}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') setDraft(null);
      }}
      // The row is a click target for selection; typing in it must not also
      // toggle the selection underneath.
      onClick={(event) => event.stopPropagation()}
      className="numbercell"
      style={{
        font: 'inherit',
        fontVariantNumeric: 'tabular-nums',
        width: 92,
        textAlign: 'right',
        padding: '2px 6px',
        background: 'transparent',
        color: 'var(--ink)',
        border: '1px solid transparent',
        borderRadius: 2,
        ...style,
      }}
    />
  );
}
