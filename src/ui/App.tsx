import { useMemo, useState } from 'react';

import { BRAND, SCOPE_STATEMENT } from '../config/branding';
import { solve } from '../engine/balance';
import { SAMPLE_CONDITIONS, SAMPLE_DESIGN_DAY, SAMPLE_ENVELOPE, SAMPLE_GAINS, SAMPLE_SITE } from '../model/sampleProject';
import type { Envelope } from '../model/types';
import { toBtuHFt2, toF } from '../model/units';
import { EnvelopePanel } from './EnvelopePanel';
import { Mark } from './Mark';

/**
 * Phase 03 shell.
 *
 * The envelope panel is real; the gains panel, the chart and hover-to-scrub
 * arrive in phases 04–05. It opens on the worked example rather than an empty
 * form, so the first look shows what the tool does.
 */
export function App() {
  const [envelope, setEnvelope] = useState<Envelope>(SAMPLE_ENVELOPE);

  const result = useMemo(
    () => solve({ envelope, gains: SAMPLE_GAINS, conditions: SAMPLE_CONDITIONS, designDay: SAMPLE_DESIGN_DAY }),
    [envelope],
  );

  return (
    <main style={{ maxWidth: 1320, margin: '0 auto', padding: '28px 24px 56px', display: 'grid', gap: 18 }}>
      <header className="panel" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', flexWrap: 'wrap' }}>
        <Mark size={40} />
        <div style={{ flex: 1 }}>
          <div className="eyebrow">{BRAND.studio}</div>
          <h1 style={{ fontSize: 22 }}>{BRAND.name}</h1>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>
          <div>{SAMPLE_SITE.label}</div>
          <div style={{ color: 'var(--loss)' }}>ERA5 99.6% · {toF(SAMPLE_DESIGN_DAY.minimum).toFixed(1)} °F · set 70 °F</div>
        </div>
      </header>

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)' }}>
        <EnvelopePanel
          envelope={envelope}
          conditions={SAMPLE_CONDITIONS}
          designDay={SAMPLE_DESIGN_DAY}
          units="IP"
          onChange={setEnvelope}
        />

        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <section className="panel" style={{ padding: '16px 18px', borderColor: result.selfHeating ? 'var(--gain)' : 'var(--loss)' }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Where this stands</div>
            <p className="display" style={{ fontSize: 19, lineHeight: 1.3, margin: '0 0 10px' }}>
              {result.selfHeating
                ? `Self-heating right through this design day, with ${toBtuHFt2(result.marginPerArea).toFixed(1)} Btu/h·ft² in hand at the worst hour.`
                : `Not self-heating yet — ${toBtuHFt2(result.peakHeatingLoadPerArea).toFixed(1)} Btu/h·ft² short at ${String(result.worstHour).padStart(2, '0')}:00.`}
            </p>
            {result.lever && (
              <p style={{ margin: '0 0 10px', color: 'var(--gain)', fontSize: 12 }}>
                {result.lever.label} is {Math.round(result.lever.share * 100)}% of the loss at that hour — that is where the gap closes fastest.
              </p>
            )}
            <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>{SCOPE_STATEMENT}</p>
          </section>

          <section className="panel" style={{ padding: '16px 18px', display: 'grid', gap: 11 }}>
            <div className="eyebrow">Headline metrics</div>
            {([
              ['Balance point', `${toF(result.balancePoint.onMeanGain).toFixed(1)} °F`],
              ['Wall-to-floor ratio', result.wallToFloorRatio.toFixed(2)],
              ['Hours needing heat', `${result.deficitHours} of 24`],
              ['Peak heating load', `${toBtuHFt2(result.peakHeatingLoadPerArea).toFixed(2)} Btu/h·ft²`],
            ] as const).map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13 }}>
                <span style={{ color: 'var(--body)' }}>{label}</span>
                <span className="display" style={{ fontSize: 16 }}>{value}</span>
              </div>
            ))}
          </section>

          <section className="panel" style={{ padding: '16px 18px' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Next</div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
              Phase 04 brings the gains panel and its schedule bars; phase 05 the 24-hour chart,
              the three-part verdict, and hover-to-scrub driving this section.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
