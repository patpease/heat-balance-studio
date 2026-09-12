import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { BalanceChart } from '../chart/BalanceChart';
import { BRAND } from '../config/branding';
import { solve } from '../engine/balance';
import { downloadBlob, exportPng } from '../io/exportPng';
import {
  SAMPLE_CONDITIONS,
  SAMPLE_DESIGN_DAY,
  SAMPLE_ENVELOPE,
  SAMPLE_GAINS,
  SAMPLE_SITE,
} from '../model/sampleProject';
import type { Conditions, DesignDay, Envelope, Gains, Site } from '../model/types';
import { EnvelopePanel } from './EnvelopePanel';
import { GainsPanel } from './GainsPanel';
import { LocationPanel } from './LocationPanel';
import { Mark } from './Mark';
import { BalancePointBand, Verdict } from './Verdict';

/**
 * Phase 06.
 *
 * The chart and the section are one tool rather than two panels sharing a
 * screen: hovering the chart scrubs the drawing to that hour, so the gain
 * arrows visibly collapse overnight while the loss arrows grow. At rest both
 * sit on the worst hour, which is the hour the verdict is decided on.
 *
 * It opens on the worked example rather than an empty form, so the first look
 * shows what the tool does — and that sample is also the floor the fallback
 * ladder lands on: if the relay is unreachable, the design day already loaded
 * stays and the panel says so.
 */
export function App() {
  const [envelope, setEnvelope] = useState<Envelope>(SAMPLE_ENVELOPE);
  const [gains, setGains] = useState<Gains>(SAMPLE_GAINS);
  // Site, design day and conditions move together — a design day belongs to a
  // place, and the ground temperature is resolved from that place's record.
  const [site, setSite] = useState<Site>(SAMPLE_SITE);
  const [designDay, setDesignDay] = useState<DesignDay>(SAMPLE_DESIGN_DAY);
  const [conditions, setConditions] = useState<Conditions>(SAMPLE_CONDITIONS);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const chartRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  const result = useMemo(
    () => solve({ envelope, gains, conditions, designDay }),
    [envelope, gains, conditions, designDay],
  );

  const shoot = async (container: HTMLDivElement | null, filename: string, caption: string) => {
    const svg = container?.querySelector('svg');
    if (!svg) return;
    setBusy(filename);
    try {
      downloadBlob(await exportPng(svg as SVGSVGElement, { filename, caption }), filename);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main style={{ maxWidth: 1340, margin: '0 auto', padding: '28px 24px 56px', display: 'grid', gap: 18 }}>
      <header className="panel" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', flexWrap: 'wrap' }}>
        <Mark size={40} />
        <div style={{ flex: 1 }}>
          <div className="eyebrow">{BRAND.studio}</div>
          <h1 style={{ fontSize: 22 }}>{BRAND.name}</h1>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>
          <div>Setpoint 70 °F · IP</div>
          <div style={{ color: 'var(--muted)' }}>Envelope-only screen</div>
        </div>
      </header>

      <LocationPanel
        site={site}
        designDay={designDay}
        conditions={conditions}
        onApply={(nextSite, nextDay, nextConditions) => {
          setSite(nextSite);
          setDesignDay(nextDay);
          setConditions(nextConditions);
        }}
      />

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <div ref={sectionRef} style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <EnvelopePanel
            envelope={envelope}
            gains={gains}
            conditions={conditions}
            designDay={designDay}
            units="IP"
            scrubHour={hoveredHour}
            onChange={setEnvelope}
            onExport={() =>
              shoot(sectionRef.current, 'heat-balance-section.png', `${site.label} — envelope section`)
            }
            exporting={busy === 'heat-balance-section.png'}
          />
        </div>

        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <Verdict result={result} units="IP" />

          <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <header
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span className="eyebrow">24-hour balance</span>
              <button
                type="button"
                onClick={() =>
                  shoot(chartRef.current, 'heat-balance-chart.png', `${site.label} — 24-hour balance`)
                }
                disabled={busy !== null}
                style={exportButton}
              >
                {busy === 'heat-balance-chart.png' ? 'Exporting…' : 'Export PNG'}
              </button>
            </header>
            <div ref={chartRef} style={{ padding: '12px 16px 16px' }}>
              <BalanceChart
                result={result}
                floorArea={envelope.floorArea}
                units="IP"
                hoveredHour={hoveredHour}
                onHoverHour={setHoveredHour}
              />
            </div>
          </section>

          <BalancePointBand result={result} units="IP" />
        </div>
      </div>

      <GainsPanel
        gains={gains}
        floorArea={envelope.floorArea}
        units="IP"
        marker={hoveredHour ?? result.worstHour}
        onChange={setGains}
      />
    </main>
  );
}

const exportButton: CSSProperties = {
  font: 'inherit',
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  padding: '4px 10px',
  background: 'none',
  border: '1px solid var(--border)',
  color: 'var(--gain)',
  cursor: 'pointer',
};
