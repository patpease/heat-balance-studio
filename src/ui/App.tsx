import { useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import { BalanceChart } from '../chart/BalanceChart';
import { BRAND } from '../config/branding';
import { SiteFooter } from './SiteFooter.js';
import { TAGLINE } from '../config/copy';
import { solve } from '../engine/balance';
import { resolveGroundTemperature } from '../engine/ua';
import { downloadBlob, exportPng } from '../io/exportPng';
import { shareUrl, stateFromLocation } from '../io/share';
import {
  SAMPLE_CONDITIONS,
  SAMPLE_DESIGN_DAY,
  SAMPLE_SITE,
} from '../model/sampleProject';
import { DEFAULT_ENVELOPE, DEFAULT_GAINS } from '../model/defaults';
import { GAIN_PRESETS } from '../model/gainPresets';
import type { Conditions, DesignDay, Envelope, Gains, Site, UnitSystem } from '../model/types';
import { EnvelopePanel } from './EnvelopePanel';
import { GainsPanel } from './GainsPanel';
import { LocationPanel } from './LocationPanel';
import { Mark } from './Mark';
import { ScopePanel } from './ScopePanel';
import { DEFAULT_VENTILATION } from '../model/ventilation';
import type { Ventilation } from '../model/ventilation';
import { ThemeIcon } from './ThemeIcon';
import { withOffscreen } from './offscreen';
import { useTheme } from './theme';
import type { ThemeChoice } from './theme';
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
  const theme = useTheme();
  const [ventilation, setVentilation] = useState<Ventilation>(shared?.ventilation ?? DEFAULT_VENTILATION);

  const [units, setUnits] = useState<UnitSystem>(shared?.units ?? 'IP');
  // DEFAULT_ENVELOPE, not SAMPLE_ENVELOPE: the worked example is 500 m² on one
  // storey and stays frozen for the golden case, but the tool opens on a
  // building shaped like the Large Office preset it loads beside it.
  const [envelope, setEnvelope] = useState<Envelope>(shared?.envelope ?? DEFAULT_ENVELOPE);
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
  // The ground temperature is RESOLVED from the design day the tool opens on,
  // not copied from the worked example. SAMPLE_CONDITIONS holds 55 °F because
  // that is a stated input of the frozen worked example; the app's own opening
  // view is Boston in February, which resolves to its own figure. Copying the
  // 55 would have meant searching "Boston" changed a number the page had
  // already shown for the same city.
  const [conditions, setConditions] = useState<Conditions>(() => {
    if (shared?.conditions) return shared.conditions;
    const ground = resolveGroundTemperature(SAMPLE_DESIGN_DAY.designMonthMeanTemperature);
    return {
      ...SAMPLE_CONDITIONS,
      groundTemperature: ground.value,
      groundTemperatureBasis: ground.basis,
    };
  });
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  /**
   * The chart's component breakdown.
   *
   * Local state and nothing else: not in the share link, not in storage, not
   * read from anywhere. "Never on by default" is easiest to keep true when
   * there is nowhere for it to be remembered — and a shared link should land
   * the recipient on the chart that answers the question, not on the one that
   * takes it apart.
   *
   * It lives here rather than in the chart because the button that toggles it
   * sits in the panel's floating bar beside the export, and because the export
   * reads the live SVG — so a detailed chart exports detailed with no
   * co-ordination between the two.
   */
  const [detailed, setDetailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const chartRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  const result = useMemo(
    // Ventilation belongs in here too. It was left out when the panel was
    // wired and the two solves drifted: the envelope table updated when the
    // heat recovery changed and the verdict beside it did not, because they
    // were reading different answers to the same question.
    () => solve({ envelope, gains, conditions, designDay, ventilation }),
    [envelope, gains, conditions, designDay, ventilation],
  );

  const copyLink = async () => {
    const url = shareUrl({ units, site, designDay, conditions, envelope, gains, ventilation });
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

  /**
   * What an exported figure is a picture OF.
   *
   * The two things someone needs off a shared image: which building, where.
   * "24-hour balance" was neither — the reader can see that it is a chart.
   *
   * Follows the badge's rule rather than reading `preset` alone: the numbers
   * may no longer be the published ones, but the building is still the
   * building, so an edited project exports its type with "edited" attached
   * instead of losing the name.
   */
  const buildingType = (() => {
    if (gains.preset) return gains.preset;
    const source = GAIN_PRESETS.find((preset) => preset.id === gains.sourceId);
    return source ? `${source.label} — edited` : 'Edited';
  })();

  /**
   * Export whichever figure `container` holds — or, when the live one is its
   * phone layout, the desk layout of the same figure.
   *
   * `standard` is that desk-layout figure as an element, and it is used only
   * when the live SVG says it is not already standard. A desk therefore
   * exports exactly what it did before; a phone mounts `standard` off screen
   * and exports that. See offscreen.tsx for why.
   */
  const shoot = async (
    container: HTMLElement | null,
    filename: string,
    caption: string,
    standard: ReactElement,
  ) => {
    const live = container?.querySelector('svg');
    if (!live) return;
    setBusy(filename);
    try {
      const phoneLayout =
        live.getAttribute('data-layout') === 'compact' || live.getAttribute('data-labels') === 'markers';
      const blob = phoneLayout
        ? await withOffscreen(standard, 880, async (host) => {
            const svg = host.querySelector('svg');
            if (!svg) throw new Error('The export copy rendered no drawing.');
            return exportPng(svg, { filename, caption });
          })
        : await exportPng(live as SVGSVGElement, { filename, caption });
      downloadBlob(blob, filename);
    } finally {
      setBusy(null);
    }
  };

  const chartProps = { result, floorArea: envelope.floorArea, units, hoveredHour, onHoverHour: setHoveredHour, detailed };

  return (
    <main className="app-main">
      {/* One bar. The studio eyebrow, name and the tool's question sit on a
          single line so the fold budget goes to the drawing and the chart. */}
      <header className="panel" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px', flexWrap: 'wrap' }}>
        <Mark size={26} />
        <h1 style={{ fontSize: 18, margin: 0 }}>{BRAND.name}</h1>
        <a className="eyebrow eyebrow-link" href={BRAND.studioUrl} style={{ fontSize: 9.5 }}>
          {BRAND.studio}
        </a>
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

          {/* Two buttons for three states: with nothing stored the operating
              system decides, and pressing either pins it. The palette for all
              three already exists in tokens.css — this only chooses between
              them. See ui/theme.ts. */}
          <div role="group" aria-label="Appearance" style={{ display: 'flex' }}>
            {([
              { choice: 'light' as ThemeChoice, icon: 'sun' as const, label: 'Light' },
              { choice: 'dark' as ThemeChoice, icon: 'moon' as const, label: 'Dark' },
            ]).map(({ choice, icon, label }) => (
              <button
                key={choice}
                type="button"
                onClick={() => theme.setPreference(choice)}
                aria-pressed={theme.resolved === choice}
                aria-label={`${label} appearance`}
                title={`${label} appearance`}
                style={{
                  ...headerButton,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px 9px',
                  borderColor: theme.resolved === choice ? 'var(--gain)' : 'var(--border)',
                  color: theme.resolved === choice ? 'var(--gain)' : 'var(--muted)',
                }}
              >
                <ThemeIcon name={icon} />
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
            ventilation={ventilation}
            conditions={conditions}
            designDay={designDay}
            units={units}
            scrubHour={hoveredHour}
            onChange={setEnvelope}
            onExport={(standard) =>
              shoot(sectionRef.current, 'heat-balance-section.png', `${site.label} · ${buildingType}`, standard)
            }
            exporting={busy === 'heat-balance-section.png'}
          />
        </div>

        {/* The title and the export button float over the chart rather than
            sitting in a bar above it. That bar cost 56 px on both panels, and
            the pixels are worth more to the drawing. */}
        <section className="panel cq" style={{ padding: 0, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {/* `.chart-bar` and `.chart-body` rather than inline: on a phone the
              bar stops floating, because there the chart has no empty top
              margin for it to float in and the buttons sat on the axis. */}
          <div className="chart-bar">
            <h2 className="eyebrow" style={{ font: 'inherit', margin: 0 }}>24-hour balance</h2>
            <span style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>
              <button
                type="button"
                onClick={() => setDetailed((on) => !on)}
                aria-pressed={detailed}
                style={{
                  ...exportButton,
                  borderColor: detailed ? 'var(--gain)' : 'var(--border)',
                  background: detailed ? 'var(--panel)' : 'none',
                }}
              >
                Details
              </button>
              <button
                type="button"
                onClick={() =>
                  shoot(
                    chartRef.current,
                    'heat-balance-chart.png',
                    `${site.label} · ${buildingType}`,
                    <BalanceChart {...chartProps} />,
                  )
                }
                disabled={busy !== null}
                style={exportButton}
              >
                {busy === 'heat-balance-chart.png' ? 'Exporting…' : 'PNG'}
              </button>
            </span>
          </div>
          <div ref={chartRef} className="chart-body">
            <BalanceChart {...chartProps} />
          </div>
        </section>
      </div>

      {/* The answer, condensed onto one row under the two things it reads from. */}
      <div className="pair pair-verdict">
        <Verdict result={result} units={units} />
        <BalancePointBand result={result} units={units} />
      </div>

      {/* Ventilation lives inside this panel rather than beside it. Its inputs
          are shaped like the occupancy input it sits under, and its own panel
          spent 280 px saying what three lines say there. */}
      <GainsPanel
        gains={gains}
        floorArea={envelope.floorArea}
        units={units}
        marker={hoveredHour ?? result.worstHour}
        onChange={setGains}
        ventilation={ventilation}
        onVentilationChange={setVentilation}
      />

      <ScopePanel />

      <SiteFooter />
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
