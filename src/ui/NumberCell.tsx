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
 * **Grouped at rest, plain while editing.** A six thousand square metre floor
 * reads as `6,000` until the field takes focus, at which point the separators
 * come off. Formatting as you type would move the caret every time a comma
 * appeared, and the alternative — leaving them on and parsing around them — is
 * the same work with a worse failure mode. Pasted commas are still accepted.
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
      onFocus={() => setDraft(plain(value, decimals))}
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
