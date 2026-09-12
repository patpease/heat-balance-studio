import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

export const cellStyle: CSSProperties = {
  textAlign: 'right',
  padding: '4px 0',
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
 */
export function NumberCell({
  value,
  decimals,
  onCommit,
  label,
}: {
  readonly value: number;
  readonly decimals: number;
  readonly onCommit: (next: number) => void;
  /** Announced to a screen reader. "Windows U-value", not "value". */
  readonly label: string;
}) {
  const formatted = value.toFixed(decimals);
  const [draft, setDraft] = useState(formatted);

  // Follow the stored value when something else moves it: editing R rewrites U,
  // and the sketch-a-box helper rewrites every row at once.
  useEffect(() => setDraft(formatted), [formatted]);

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onCommit(parsed);
    else setDraft(formatted);
  };

  return (
    <input
      value={draft}
      inputMode="decimal"
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') setDraft(formatted);
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
        padding: '4px 6px',
        background: 'transparent',
        color: 'var(--ink)',
        border: '1px solid transparent',
        borderRadius: 2,
      }}
    />
  );
}
