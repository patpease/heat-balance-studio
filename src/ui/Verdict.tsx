import { VERDICT } from '../config/copy';
import type { BalanceResult } from '../engine/balance';
import type { UnitSystem } from '../model/types';
import { LABELS, toBtuHFt2, toF } from '../model/units';

/**
 * The verdict, in three parts: where you are, the lever, what this is not.
 *
 * **And in three STATES, not two.** A building whose IT sits on chilled water
 * is not passively self-heating — the room never receives that heat — but it is
 * not short either: a recovery chiller on the loop it already runs turns the
 * same heat into heating hot water. Calling that "not self-heating yet" would
 * send someone chasing envelope work they do not need; calling it self-heating
 * would be a claim about a passive building that is not true. The third state
 * says what is actually happening, and the panel takes a third border colour so
 * it reads as its own answer at a glance rather than a qualified pass.
 *
 * The framing is the art of the possible. The tool exists to make someone want
 * to chase a self-heating building and show them where to push — not to certify
 * that they got there. A sentence that points forward cannot be screenshotted
 * as a pass, which solves the overclaiming problem better than a disclaimer
 * bolted onto "heating-free" ever could.
 *
 * The lever line is computed, not written: sort the worst hour's loss terms and
 * name the largest with its share. When a later version links to guidance, the
 * links hang off this line.
 *
 * The scope statement used to sit here as a third paragraph. It moved to the
 * scope panel, which already carried it verbatim, when this became a strip
 * under the drawing rather than a column beside it — the duplicate was costing
 * fold space to say something twice.
 */

export interface VerdictProps {
  readonly result: BalanceResult;
  readonly units: UnitSystem;
}

export function Verdict({ result, units }: VerdictProps) {
  const ip = units === 'IP';
  const flux = (wattsPerSqM: number) => (ip ? toBtuHFt2(wattsPerSqM) : wattsPerSqM);
  const labels = LABELS[units];
  const hour = `${String(result.worstHour).padStart(2, '0')}:00`;

  const shortfall = flux(result.peakHeatingLoadPerArea).toFixed(1);
  const headline =
    result.status === 'self-heating'
      ? VERDICT.clear(flux(result.marginPerArea).toFixed(1), labels.heatFlux, hour)
      : result.status === 'recovered'
        ? VERDICT.recovered()
        : VERDICT.short(shortfall, labels.heatFlux, hour);

  /** The accent this answer is drawn in. Three states, three tokens. */
  const accent =
    result.status === 'self-heating'
      ? 'var(--gain)'
      : result.status === 'recovered'
        ? 'var(--recover)'
        : 'var(--loss)';

  // kW both times: recovery is plant, and plant is sized in kW in both systems.
  const kw = (watts: number) => Math.round(watts / 1000).toLocaleString('en-US');

  const recoveryNote =
    result.recovery === null
      ? null
      : result.status === 'recovered'
        ? VERDICT.recoveredNote(
            shortfall,
            labels.heatFlux,
            hour,
            kw(result.recovery.peakUsed),
            kw(result.recovery.availableAtWorstHour),
          )
        : result.status === 'short' && result.recovery.hoursCovered > 0
          ? VERDICT.recoveredPartly(
              result.recovery.hoursCovered,
              result.deficitHours,
              flux(Math.abs(result.recovery.marginPerArea)).toFixed(1),
              labels.heatFlux,
            )
          : null;

  const lever = result.lever
    ? (result.selfHeating ? VERDICT.leverClear : VERDICT.leverShort)(
        result.lever.label,
        Math.round(result.lever.share * 100),
      )
    : null;

  return (
    <section
      className="panel"
      style={{ padding: '8px 14px', borderColor: accent }}
    >
      <h2 className="eyebrow" style={{ font: 'inherit', margin: '0 0 4px' }}>Where this stands</h2>

      <p className="display" style={{ fontSize: 16, lineHeight: 1.25, margin: '0 0 3px' }}>
        {headline}
      </p>

      {recoveryNote && (
        <p
          style={{
            margin: '0 0 3px',
            fontSize: 12,
            color: 'var(--recover)',
            maxWidth: '62ch',
            lineHeight: 1.45,
          }}
        >
          {recoveryNote}
        </p>
      )}

      {lever && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--gain)', maxWidth: '62ch', lineHeight: 1.45 }}>{lever}</p>
      )}
    </section>
  );
}

/**
 * Balance point, reported as a band.
 *
 * A scheduled building does not have one balance point. The same building here
 * returns roughly +39 °F on 24-hour mean gain, +61 °F overnight and +10 °F at
 * occupied peak — one number would be a lie of omission, and the spread IS the
 * insight: self-heating at lunchtime, nowhere near it before dawn.
 *
 * Lower is better, which is the opposite of what the sign invites you to think:
 * a lower balance point means the building needs heat only at colder outdoor
 * temperatures.
 *
 * The four-line explanation that used to close this panel is gone; the band and
 * its two labelled ends carry the same point without the prose, and the panel
 * now has to share a row with the verdict.
 */
export function BalancePointBand({ result, units }: VerdictProps) {
  const temp = (celsius: number) => (units === 'IP' ? toF(celsius) : celsius);
  const labels = LABELS[units];

  const { onMeanGain, atPeakGain, atMinGain } = result.balancePoint;
  const low = temp(atPeakGain);
  const high = temp(atMinGain);
  const mean = temp(onMeanGain);
  const span = high - low;
  const position = span > 0 ? Math.min(1, Math.max(0, (mean - low) / span)) : 0.5;

  return (
    <section className="panel" style={{ padding: '8px 14px' }}>
      <h2 className="eyebrow" style={{ font: 'inherit', margin: '0 0 4px' }}>Balance point</h2>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 7 }}>
        <span className="display" style={{ fontSize: 22 }}>
          {mean.toFixed(1)} {labels.temperature}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>on 24-hour mean gain</span>
      </div>

      {/*
        The viewBox is wide and shallow on purpose.
        
        At 300x26 it scaled with the column and rendered 49 px tall for what is
        a rule and a dot — and since this was the taller half of the strip, it
        set the height of the verdict beside it too. Stretching it with
        preserveAspectRatio="none" would have flattened the marker into an
        ellipse, so the box matches the shape it is drawn at instead.
      */}
      <svg
        viewBox="0 0 640 26"
        role="img"
        aria-label="Balance point band"
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        <line x1="8" y1="13" x2="632" y2="13" stroke="var(--border-strong)" strokeWidth="2" />
        <line x1="8" y1="6" x2="8" y2="20" stroke="var(--loss)" strokeWidth="2" />
        <line x1="632" y1="6" x2="632" y2="20" stroke="var(--loss)" strokeWidth="2" />
        <circle cx={8 + position * 624} cy="13" r="6" fill="var(--gain)" />
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
        <span>{low.toFixed(1)} at peak gain</span>
        <span>{high.toFixed(1)} overnight</span>
      </div>
    </section>
  );
}
