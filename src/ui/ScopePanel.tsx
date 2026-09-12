import { useState } from 'react';

import { ASSUMPTIONS, EXCLUSIONS_STATEMENT, SCOPE_STATEMENT, WEATHER_ATTRIBUTION } from '../config/copy';

/**
 * What the tool is, and what it leaves out.
 *
 * **Permanent page furniture, not a tooltip.** Three of the nine assumptions
 * below are things the user cannot change — no buffer boundary, φ held at 1, no
 * flat-day option — which makes stating them the only honest option available.
 * An assumption nobody can see is the one that gets argued with after the fact.
 *
 * The first three are always visible because they are the ones that bite. The
 * rest are behind a disclosure so the panel does not become a wall nobody
 * reads, which would defeat the point of putting them on the page at all.
 */
export function ScopePanel() {
  const [open, setOpen] = useState(false);
  const [always, rest] = [ASSUMPTIONS.slice(0, 3), ASSUMPTIONS.slice(3)];

  return (
    <section className="panel" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
        <h2 className="eyebrow" style={{ font: 'inherit', margin: 0 }}>What this is</h2>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          style={{
            font: 'inherit',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginLeft: 'auto',
            padding: '3px 9px',
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--gain)',
            cursor: 'pointer',
          }}
        >
          {open ? 'Fewer assumptions' : `All ${ASSUMPTIONS.length} assumptions`}
        </button>
      </div>

      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--body)', maxWidth: '70ch', lineHeight: 1.55 }}>
        {SCOPE_STATEMENT} {EXCLUSIONS_STATEMENT}
      </p>

      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          fontSize: 11.5,
          color: 'var(--muted)',
          display: 'grid',
          gap: 5,
          maxWidth: '78ch',
        }}
      >
        {(open ? [...always, ...rest] : always).map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
      </ul>

      <p style={{ margin: '10px 0 0', fontSize: 10.5, color: 'var(--muted)' }}>{WEATHER_ATTRIBUTION}</p>
    </section>
  );
}
