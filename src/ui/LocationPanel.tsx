import { useRef, useState } from 'react';

import { fetchDesignDay, searchPlaces } from '../climate/weatherClient';
import { readWeatherFile } from '../climate/weatherFile';
import type { GeocodeMatch } from '../climate/openMeteo';
import { resolveGroundTemperature } from '../engine/ua';
import { GROUND_DRIFT_LIMIT_K } from '../model/defaults';
import type { Conditions, DesignDay, Site } from '../model/types';
import { toF } from '../model/units';

/**
 * Location, and the weather that follows from it.
 *
 * Type a US city and state; the design day is derived automatically. The one
 * design requirement, and the reason this is a panel rather than a single
 * field: **the geocoder is fuzzy, so the match must be shown and the
 * alternatives offered.**
 *
 * "Boston, Massachusetts" returns Boston and then *Pittsfield*; "Springfield,
 * Missouri" returns Springfield and then *Palmyra*. The state ranks but does
 * not filter. The first result is reliably right — which is exactly what makes
 * silent selection dangerous: it would be correct almost always and wrong
 * invisibly, and a design day derived for the wrong town never announces
 * itself.
 */

export interface LocationPanelProps {
  readonly site: Site;
  readonly designDay: DesignDay;
  readonly conditions: Conditions;
  readonly onApply: (site: Site, designDay: DesignDay, conditions: Conditions) => void;
}

export function LocationPanel({ site, designDay, conditions, onApply }: LocationPanelProps) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<readonly GeocodeMatch[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const search = async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    abort.current?.abort();
    abort.current = new AbortController();

    setBusy(true);
    setStatus(null);
    const result = await searchPlaces(trimmed, abort.current.signal);
    setBusy(false);

    if (!result.ok) {
      if (result.message) setStatus(result.message);
      return;
    }
    setMatches(result.value);
    if (result.value.length === 0) setStatus(`No US place matched “${trimmed}”. Try adding the state.`);
  };

  const apply = async (match: GeocodeMatch) => {
    setBusy(true);
    setStatus(null);
    const result = await fetchDesignDay(match, 0.4);
    setBusy(false);

    if (!result.ok) {
      // The promise: a failure never blanks the tool. The design day already
      // loaded stays, and the message says so.
      setStatus(result.message);
      return;
    }

    const day = result.value.designDay;
    // The resolver runs on the NEW site's annual mean: 55 °F within 3 K of it,
    // the derived mean beyond. Denver sits at 2.9 K, one good year from
    // flipping — which is why the basis is always named rather than assumed.
    const ground = resolveGroundTemperature(day.annualMeanTemperature);

    onApply(
      {
        label: match.label,
        latitude: match.latitude,
        longitude: match.longitude,
        elevation: match.elevation,
        timezone: match.timezone,
        source: 'geocoded',
      },
      day,
      { ...conditions, groundTemperature: ground.value, groundTemperatureBasis: ground.basis },
    );
    setMatches(null);
    setQuery('');
    setStatus(null);
  };

  const takeFile = async (file: File) => {
    setBusy(true);
    setStatus(null);
    setNote(null);
    const outcome = await readWeatherFile(file);
    setBusy(false);

    if (!outcome.ok) {
      setStatus(outcome.message);
      return;
    }
    const { designDay: day, site: fileSite, problems, summary } = outcome.value;
    const ground = resolveGroundTemperature(day.annualMeanTemperature);
    onApply(fileSite, day, {
      ...conditions,
      groundTemperature: ground.value,
      groundTemperatureBasis: ground.basis,
    });
    setMatches(null);
    setNote(summary);
    if (problems.length > 0) setStatus(problems.join(' '));
  };

  const groundNote =
    conditions.groundTemperatureBasis === 'rule-of-thumb'
      ? `ground ${toF(conditions.groundTemperature).toFixed(0)} °F, the rule of thumb`
      : `ground ${toF(conditions.groundTemperature).toFixed(1)} °F, this site’s annual mean — more than ${GROUND_DRIFT_LIMIT_K} K from the rule of thumb`;

  return (
    <section className="panel" style={{ padding: '14px 18px', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="eyebrow" style={{ minWidth: 62 }}>
          Location
        </span>
        <input
          value={query}
          placeholder="City, State — Boston, Massachusetts"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && search()}
          aria-label="Search for a US city"
          style={{
            font: 'inherit',
            flex: 1,
            minWidth: 220,
            padding: '6px 9px',
            background: 'var(--page)',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
          }}
        />
        <button type="button" onClick={search} disabled={busy} style={button}>
          {busy ? 'Working…' : 'Search'}
        </button>
      </div>

      {matches && matches.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>
            Pick the right one — the geocoder ranks by relevance but does not filter by state.
          </span>
          {matches.map((match, index) => (
            <button
              key={`${match.label}-${match.latitude}`}
              type="button"
              onClick={() => apply(match)}
              disabled={busy}
              style={{
                ...button,
                textAlign: 'left',
                textTransform: 'none',
                letterSpacing: 0,
                fontSize: 12,
                padding: '7px 10px',
                borderColor: index === 0 ? 'var(--gain)' : 'var(--border)',
                color: 'var(--ink)',
              }}
            >
              {match.label}
              <span style={{ color: 'var(--muted)' }}>
                {' '}· {match.latitude.toFixed(2)}, {match.longitude.toFixed(2)} · {Math.round(match.elevation)} m
              </span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 11 }}>
        <span style={{ color: 'var(--ink)', fontSize: 13 }}>{site.label}</span>
        <span style={{ color: 'var(--loss)' }}>
          99.6% design {toF(designDay.minimum).toFixed(1)} °F
        </span>
        <span style={{ color: 'var(--muted)' }}>{groundNote}</span>
        <span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{designDay.provenance}</span>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void takeFile(file);
        }}
        style={{
          border: `1px dashed ${dragging ? 'var(--gain)' : 'var(--border)'}`,
          background: dragging ? 'var(--page)' : 'transparent',
          padding: '10px 12px',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          fontSize: 11,
          color: 'var(--muted)',
        }}
      >
        <label style={{ ...button, display: 'inline-block' }}>
          Open .epw or .zip
          <input
            type="file"
            accept=".epw,.zip"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void takeFile(file);
              event.target.value = '';
            }}
            style={{ display: 'none' }}
          />
        </label>
        <span>
          Or drop one here. A <code>.ddy</code> beside the <code>.epw</code> supplies the published ASHRAE minimum;
          the shape still comes from the file's own cold days, because the ASHRAE heating design day is flat.
        </span>
        <span style={{ marginLeft: 'auto' }}>Read in your browser — nothing is uploaded.</span>
      </div>

      {note && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--gain)', borderLeft: '2px solid var(--gain)', paddingLeft: 9 }}>
          {note}
        </p>
      )}

      {status && (
        <p
          style={{
            margin: 0,
            fontSize: 11.5,
            color: 'var(--loss)',
            borderLeft: '2px solid var(--loss)',
            paddingLeft: 9,
          }}
        >
          {status}
        </p>
      )}
    </section>
  );
}

const button: React.CSSProperties = {
  font: 'inherit',
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  padding: '6px 12px',
  background: 'none',
  border: '1px solid var(--border)',
  color: 'var(--gain)',
  cursor: 'pointer',
};
