import { BALANCE_POINT_NOTE, EXCLUSIONS_STATEMENT, SCOPE_STATEMENT, VERDICT } from '../config/copy';
import type { BalanceResult } from '../engine/balance';
import type { UnitSystem } from '../model/types';
import { LABELS, toBtuHFt2, toF } from '../model/units';

/**
 * The verdict, in three parts: where you are, the lever, what this is not.
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

  const headline = result.selfHeating
    ? VERDICT.clear(flux(result.marginPerArea).toFixed(1), labels.heatFlux, hour)
    : VERDICT.short(flux(result.peakHeatingLoadPerArea).toFixed(1), labels.heatFlux, hour);

  const lever = result.lever
    ? (result.selfHeating ? VERDICT.leverClear : VERDICT.leverShort)(
        result.lever.label,
        Math.round(result.lever.share * 100),
      )
    : null;

  return (
    <section
      className="panel"
      style={{ padding: '16px 18px', borderColor: result.selfHeating ? 'var(--gain)' : 'var(--loss)' }}
    >
      <h2 className="eyebrow" style={{ font: 'inherit', margin: '0 0 10px' }}>Where this stands</h2>

      <p className="display" style={{ fontSize: 20, lineHeight: 1.32, margin: '0 0 10px' }}>
        {headline}
      </p>

      {lever && (
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--gain)', maxWidth: '54ch' }}>{lever}</p>
      )}

      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', maxWidth: '58ch', lineHeight: 1.5 }}>
        {SCOPE_STATEMENT} {EXCLUSIONS_STATEMENT}
      </p>
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
    <section className="panel" style={{ padding: '16px 18px' }}>
      <h2 className="eyebrow" style={{ font: 'inherit', margin: '0 0 10px' }}>Balance point</h2>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <span className="display" style={{ fontSize: 27 }}>
          {mean.toFixed(1)} {labels.temperature}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>on 24-hour mean gain</span>
      </div>

      <svg viewBox="0 0 300 26" role="img" aria-label="Balance point band" style={{ display: 'block', width: '100%', height: 'auto' }}>
        <line x1="6" y1="13" x2="294" y2="13" stroke="var(--border-strong)" strokeWidth="2" />
        <line x1="6" y1="6" x2="6" y2="20" stroke="var(--loss)" strokeWidth="2" />
        <line x1="294" y1="6" x2="294" y2="20" stroke="var(--loss)" strokeWidth="2" />
        <circle cx={6 + position * 288} cy="13" r="5" fill="var(--gain)" />
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>
        <span>
          {low.toFixed(1)} at peak gain
        </span>
        <span>{high.toFixed(1)} overnight</span>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--muted)', maxWidth: '52ch' }}>
        {BALANCE_POINT_NOTE}
      </p>
    </section>
  );
}
