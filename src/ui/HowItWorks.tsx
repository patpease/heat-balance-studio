import { HOW_IT_WORKS } from '../config/copy';

/**
 * What the tool wants from you, in the order it wants it.
 *
 * This sits where the weather-file drop zone used to, beside the location
 * field. That panel is hidden rather than deleted — see `LocationPanel` — and
 * the half-row it leaves is worth more spent saying what the tool is: nothing
 * on the first screen previously explained the sequence, and a user who has not
 * scrolled to the gains panel has no way to know it exists.
 *
 * **Three across, not three down.** Stacked, the same words ran 191 px against
 * the location panel's 98 and pushed the verdict below the fold — the one
 * measurement this layout was built around. Across, it fits the row the
 * location field already needs, and the arrows say "sequence" in a way a
 * numbered list of three only implies.
 *
 * The order is load-bearing, which is why it is drawn as a flow at all.
 * Location sets the weather the envelope loses heat to; the envelope sets the
 * area the gains are spread over. Read in any other order the three panels look
 * like three unrelated forms.
 */
export function HowItWorks() {
  return (
    <section className="panel cq" style={{ padding: '9px 14px', display: 'grid', gap: 6, alignContent: 'start' }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h2 className="eyebrow" style={{ font: 'inherit', margin: 0 }}>
          How it works
        </h2>
        <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{HOW_IT_WORKS.lede}</span>
      </div>

      <ol
        className="how-steps"
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          fontSize: 10.5,
          color: 'var(--muted)',
        }}
      >
        {HOW_IT_WORKS.steps.map((step, index) => (
          <li key={step.title} style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'flex-start' }}>
            {/* Between the steps, never before the first: the arrow is the
                relationship, so one in front of "Location" would claim a
                predecessor that does not exist.

                In --gain rather than a border token. It was drawn in
                --border-strong, which on the dark panel is #3D444B against
                #23272B — present in the DOM and invisible on the screen, which
                is the worst outcome for the one glyph carrying the sequence. */}
            {index > 0 && (
              <span aria-hidden style={{ color: 'var(--gain)', flex: 'none', lineHeight: 1.5 }}>
                →
              </span>
            )}
            <span style={{ flex: 1 }}>
              <span style={{ color: 'var(--ink)' }}>{step.title}</span> {step.body}
            </span>
          </li>
        ))}
      </ol>

      <p style={{ margin: 0, fontSize: 10, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 5 }}>
        {HOW_IT_WORKS.answer}
      </p>
    </section>
  );
}
