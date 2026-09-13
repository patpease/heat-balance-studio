import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { BalanceChart } from '../chart/BalanceChart';
import { BRAND } from '../config/branding';
import { TAGLINE } from '../config/copy';
import { solve } from '../engine/balance';
import { downloadBlob, exportPng } from '../io/exportPng';
import { shareUrl, stateFromLocation } from '../io/share';
import {
  SAMPLE_CONDITIONS,
  SAMPLE_DESIGN_DAY,
  SAMPLE_ENVELOPE,
  SAMPLE_SITE,
} from '../model/sampleProject';
import { DEFAULT_GAINS } from '../model/defaults';
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
 * It opens on the worked example's building rather than an empty form, so the
 * first look shows what the tool does — and that sample is also the floor the
 * fallback ladder lands on: if the relay is unreachable, the design day already
 * loaded stays and the panel says so.
 *
 * The LOADS it opens with are the Large Office preset rather than the worked
 * example's own, which are the original unsourced placeholders. The worked
 * example stays exactly as it is in `sampleProject.ts` because the golden-case
 * test is built on it — but nothing unsourced should be the first thing a user
 * sees.
 */
export function App() {
  const shared = useMemo(() => stateFromLocation(), []);

  const [units, setUnits] = useState<UnitSystem>(shared?.units ?? 'IP');
  const [envelope, setEnvelope] = useState<Envelope>(shared?.envelope ?? SAMPLE_ENVELOPE);
  // DEFAULT_GAINS, not SAMPLE_GAINS: the worked example's five densities are
  // the original unsourced placeholders, and opening on them meant the picker
  // read "Office (provisional) — not a listed type" on first load. The envelope
  // and the site are still the Boston example; only the loads are now a real
  // building type.
  const [gains, setGains] = useState<Gains>(shared?.gains ?? DEFAULT_GAINS);
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
    <main style={{ maxWidth: 1340, margin: '0 auto', padding: '10px 20px 40px', display: 'grid', gap: 8 }}>
      {/* One bar. The studio eyebrow, name and the tool's question sit on a
          single line so the fold budget goes to the drawing and the chart. */}
      <header className="panel" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px', flexWrap: 'wrap' }}>
        <Mark size={26} />
        <h1 style={{ fontSize: 18, margin: 0 }}>{BRAND.name}</h1>
        <span className="eyebrow" style={{ fontSize: 9.5 }}>{BRAND.studio}</span>
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)' }}>{TAGLINE}</p>
        <div style={{ flex: 1 }} />
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

      {/* The drawing and the chart are the two things a user reads together, so
          they sit side by side and stretch to the same height. The verdict used
          to live above the chart and pushed it out of alignment. */}
      <div className="pair">
        <div ref={sectionRef} style={{ display: 'grid', alignContent: 'stretch' }}>
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

        {/* The title and the export button float over the chart rather than
            sitting in a bar above it. That bar cost 56 px on both panels, and
            the pixels are worth more to the drawing. */}
        <section className="panel" style={{ padding: 0, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 14,
              right: 10,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            <h2 className="eyebrow" style={{ font: 'inherit', margin: 0 }}>24-hour balance</h2>
            <button
              type="button"
              onClick={() =>
                shoot(chartRef.current, 'heat-balance-chart.png', `${site.label} — 24-hour balance`)
              }
              disabled={busy !== null}
              style={{ ...exportButton, pointerEvents: 'auto' }}
            >
              {busy === 'heat-balance-chart.png' ? 'Exporting…' : 'PNG'}
            </button>
          </div>
          <div ref={chartRef} style={{ padding: '30px 14px 12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <BalanceChart
              result={result}
              floorArea={envelope.floorArea}
              units={units}
              hoveredHour={hoveredHour}
              onHoverHour={setHoveredHour}
            />
          </div>
        </section>
      </div>

      {/* The answer, condensed onto one row under the two things it reads from. */}
      <div className="pair pair-verdict">
        <Verdict result={result} units={units} />
        <BalancePointBand result={result} units={units} />
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
