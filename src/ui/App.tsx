import { BRAND, SCOPE_STATEMENT } from '../config/branding';
import { Mark } from './Mark';

/**
 * Phase 00 shell.
 *
 * Deliberately almost empty: this phase exists to prove the scaffold serves,
 * the tokens resolve in all three theme states, the fonts load, and the CSP is
 * clean. The engine arrives in phase 01 with no UI at all, and the panels here
 * are replaced wholesale in phases 03–05.
 */
export function App() {
  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 32px 56px' }}>
      <header
        className="panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '14px 18px',
          marginBottom: 24,
        }}
      >
        <Mark size={44} />
        <div>
          <div className="eyebrow">{BRAND.studio}</div>
          <h1 style={{ fontSize: 26 }}>{BRAND.name}</h1>
        </div>
      </header>

      <section className="panel" style={{ padding: '18px 20px' }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Phase 00 — scaffold
        </div>
        <p style={{ margin: '0 0 12px', color: 'var(--body)', maxWidth: '62ch' }}>
          Can this building be designed to need no heating at all? Five envelope
          surfaces, ASHRAE-style internal gains, and a 24-hour balance against a
          derived cold design day.
        </p>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12, maxWidth: '70ch' }}>
          {SCOPE_STATEMENT}
        </p>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 1,
          background: 'var(--border)',
          border: '1px solid var(--border)',
          marginTop: 24,
        }}
      >
        {/* Token check: every one of these must resolve in all three theme
            states. A colour that exists only inside one block is the classic
            unreadable-artifact bug, and tests/theme.test.ts guards it. */}
        {(
          [
            ['Loss', 'var(--loss)'],
            ['Gain', 'var(--gain)'],
            ['Ink', 'var(--ink)'],
            ['Body', 'var(--body)'],
            ['Muted', 'var(--muted)'],
          ] as const
        ).map(([label, token]) => (
          <div key={label} className="panel" style={{ padding: '12px 14px', border: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {label}
            </div>
            <div style={{ color: token, fontSize: 18 }}>0.00</div>
          </div>
        ))}
      </section>
    </main>
  );
}
