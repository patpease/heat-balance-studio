import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { BalanceChart } from '../chart/BalanceChart';
import { BRAND } from '../config/branding';
import { INTRO, TAGLINE } from '../config/copy';
import { solve } from '../engine/balance';
import { downloadBlob, exportPng } from '../io/exportPng';
import { shareUrl, stateFromLocation } from '../io/share';
import {
  SAMPLE_CONDITIONS,
  SAMPLE_DESIGN_DAY,
  SAMPLE_ENVELOPE,
  SAMPLE_GAINS,
  SAMPLE_SITE,
} from '../model/sampleProject';
import type { Conditions, DesignDay, Envelope, Gains, Site, UnitSystem } from '../model/types';
import { EnvelopePanel } from './EnvelopePanel';
import { GainsPanel } from './GainsPanel';
import { LocationPanel } from './LocationPanel';
import { Mark } from './Mark';
import { ScopePanel } from './ScopePanel';
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
  const shared = useMemo(() => stateFromLocation(), []);

  const [units, setUnits] = useState<UnitSystem>(shared?.units ?? 'IP');
  const [envelope, setEnvelope] = useState<Envelope>(shared?.envelope ?? SAMPLE_ENVELOPE);
  const [gains, setGains] = useState<Gains>(shared?.gains ?? SAMPLE_GAINS);
  // Site, design day and conditions move together — a design day belongs to a
  // place, and the ground temperature is resolved from that place's record.
  const [site, setSite] = useState<Site>(shared?.site ?? SAMPLE_SITE);
  const [designDay, setDesignDay] = useState<DesignDay>(shared?.designDay ?? SAMPLE_DESIGN_DAY);
  const [conditions, setConditions] = useState<Conditions>(shared?.conditions ?? SAMPLE_CONDITIONS);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const chartRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  const result = useMemo(
    () => solve({ envelope, gains, conditions, designDay }),
    [envelope, gains, conditions, designDay],
  );

  const copyLink = async () => {
    const url = shareUrl({ units, site, designDay, conditions, envelope, gains });
    try {
      await navigator.clipboard.writeText(url);
      setCopied('Link copied');
    } catch {
      // Clipboard access can be refused; putting the URL in the address bar is
      // a worse experience but always works.
      window.history.replaceState(null, '', url);
      setCopied('Link is in the address bar');
    }
    window.setTimeout(() => setCopied(null), 2600);
  };

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
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>{TAGLINE}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {copied && <span style={{ fontSize: 11, color: 'var(--gain)' }}>{copied}</span>}
          <button type="button" onClick={copyLink} style={headerButton}>
            Copy link
          </button>
          <div role="group" aria-label="Unit system" style={{ display: 'flex' }}>
            {(['IP', 'SI'] as const).map((system) => (
              <button
                key={system}
                type="button"
                onClick={() => setUnits(system)}
                aria-pressed={units === system}
                style={{
                  ...headerButton,
                  borderColor: units === system ? 'var(--gain)' : 'var(--border)',
                  color: units === system ? 'var(--gain)' : 'var(--muted)',
                }}
              >
                {system}
              </button>
            ))}
          </div>
        </div>
      </header>

      <LocationPanel
        site={site}
        designDay={designDay}
        conditions={conditions}
        units={units}
        onApply={(nextSite, nextDay, nextConditions) => {
          setSite(nextSite);
          setDesignDay(nextDay);
          setConditions(nextConditions);
        }}
      />

      <p style={{ margin: 0, fontSize: 13, color: 'var(--body)', maxWidth: '74ch', lineHeight: 1.55 }}>{INTRO}</p>

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <div ref={sectionRef} style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <EnvelopePanel
            envelope={envelope}
            gains={gains}
            conditions={conditions}
            designDay={designDay}
            units={units}
            scrubHour={hoveredHour}
            onChange={setEnvelope}
            onExport={() =>
              shoot(sectionRef.current, 'heat-balance-section.png', `${site.label} — envelope section`)
            }
            exporting={busy === 'heat-balance-section.png'}
          />
        </div>

        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <Verdict result={result} units={units} />

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
              <h2 className="eyebrow" style={{ font: 'inherit', margin: 0 }}>24-hour balance</h2>
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
                units={units}
                hoveredHour={hoveredHour}
                onHoverHour={setHoveredHour}
              />
            </div>
          </section>

          <BalancePointBand result={result} units={units} />
        </div>
      </div>

      <GainsPanel
        gains={gains}
        floorArea={envelope.floorArea}
        units={units}
        marker={hoveredHour ?? result.worstHour}
        onChange={setGains}
      />

      <ScopePanel />
    </main>
  );
}

const headerButton: CSSProperties = {
  font: 'inherit',
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  padding: '5px 11px',
  background: 'none',
  border: '1px solid var(--border)',
  color: 'var(--gain)',
  cursor: 'pointer',
};

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
