import { useRef, useState } from 'react';

import { fetchDesignDay, searchPlaces } from '../climate/weatherClient';
import { readWeatherFile } from '../climate/weatherFile';
import type { GeocodeMatch } from '../climate/openMeteo';
import { resolveGroundTemperature } from '../engine/ua';
import { HELP } from '../config/copy';
import { GROUND_DRIFT_LIMIT_K } from '../model/defaults';
import type { Conditions, DesignDay, Site, UnitSystem } from '../model/types';
import { deltaToF, LABELS, toF, toFt } from '../model/units';
import { grouped } from './format';
import { HowItWorks } from './HowItWorks';

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
 *
 * **The weather-file drop zone is hidden, and the code is deliberately still
 * here.** Dropping an EPW gave a worse hourly profile than the derived design
 * day — a single recorded year against the average shape of ten — and the
 * `.ddy` beside it advertised published ASHRAE design conditions, which made
 * the tool look like a load calculation it has never been. `WEATHER_FILE_UI`
 * switches the panel back on; the parser, the drop handlers and their tests are
 * untouched, so nothing has to be rebuilt to reinstate it.
 *
 * **The half-row it leaves goes to `HowItWorks`.** The location field and the
 * explanation sit side by side rather than stacked, which is what kept this
 * panel to one row in the first place. The matches list and any message appear
 * below both, full width, because either column can produce them.
 *
 * **This panel prints temperatures, so it needs `units`.** It shipped without
 * them and stayed in Fahrenheit under SI — a number that is still plausible,
 * still has a unit beside it, and is simply the other system's answer. Note
 * that the ground-drift limit is a temperature DIFFERENCE and takes
 * `deltaToF`: 3 K of drift is 5.4 °F of drift, not 37.4 °F.
 */

export interface LocationPanelProps {
  readonly site: Site;
  readonly designDay: DesignDay;
  readonly conditions: Conditions;
  readonly units: UnitSystem;
  readonly onApply: (site: Site, designDay: DesignDay, conditions: Conditions) => void;
}

/**
 * Whether the weather-file column is rendered at all.
 *
 * Typed rather than inferred as `false`, so the branch below stays live code to
 * the compiler and the handlers it reads do not become unused.
 */
const WEATHER_FILE_UI: boolean = false;

export function LocationPanel({ site, designDay, conditions, units, onApply }: LocationPanelProps) {
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

  const labels = LABELS[units];
  const ip = units === 'IP';
  /** An absolute temperature, in the displayed system. */
  const temp = (celsius: number) => (ip ? toF(celsius) : celsius);
  /** A temperature DIFFERENCE. Never `temp` — see the note above. */
  const drift = ip ? deltaToF(GROUND_DRIFT_LIMIT_K).toFixed(1) : String(GROUND_DRIFT_LIMIT_K);

  const groundNote =
    conditions.groundTemperatureBasis === 'rule-of-thumb'
      ? `ground ${temp(conditions.groundTemperature).toFixed(0)} ${labels.temperature}, the rule of thumb`
      : `ground ${temp(conditions.groundTemperature).toFixed(1)} ${labels.temperature}, this site’s annual mean — more than ${drift} ${labels.temperatureDelta} from the rule of thumb`;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="pair">
      <section className="panel" style={{ padding: '9px 14px', display: 'grid', gap: 6, alignContent: 'start' }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 className="eyebrow" style={{ font: 'inherit', margin: 0 }}>
          Location
        </h2>
        <input
          value={query}
          placeholder="City, State — Boston, Massachusetts"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && search()}
          aria-label="Search for a US city"
          style={{
            font: 'inherit',
            flex: 1,
            minWidth: 150,
            padding: '4px 8px',
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
                {' '}· {match.latitude.toFixed(2)}, {match.longitude.toFixed(2)} ·{' '}
                {grouped(ip ? toFt(match.elevation) : match.elevation)} {labels.length}
              </span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 10.5 }}>
        <span style={{ color: 'var(--ink)', fontSize: 12 }}>{site.label}</span>
        <span style={{ color: 'var(--loss)' }}>
          99.6% design {temp(designDay.minimum).toFixed(1)} {labels.temperature}
        </span>
        <span style={{ color: 'var(--muted)' }}>{groundNote}</span>
      </div>
      {/* Provenance and the design-day option share a line. One says where the
          weather came from, the other what is being done with it, and neither
          fills a 645 px row on its own — the toggle on a row of its own cost
          29 px and pushed the verdict below the fold.

          The flat-day option belongs here because it is a statement about the
          weather, not about the building. It was held off with no control and
          disclosed in the assumptions; the assumption was fine and the silence
          was not, because the one person who needs it is the one cross-checking
          against a load calculation and finding a number that will not match. */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 10.5 }}>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{designDay.provenance}</span>
        {/* No `marginLeft: auto`. Twice now an auto margin in a wrapping flex
            row has swallowed the free space the items after it needed and
            pushed them onto a second line — the envelope panel's export button
            first, this row's second button here. In a `flex-wrap` row, let
            things flow. */}
        <span className="eyebrow" style={{ fontSize: 9.5 }}>Design day</span>
        {([
          // Short because the row also carries the provenance string, and the
          // two together have 612 px. The title attribute and the warning line
          // below carry what the labels cannot.
          { flat: false, label: 'Diurnal' },
          { flat: true, label: 'Flat (ASHRAE)' },
        ]).map(({ flat, label }) => (
          <button
            key={label}
            type="button"
            aria-pressed={conditions.flatDesignDay === flat}
            title={HELP.flatDesignDay}
            onClick={() => onApply(site, designDay, { ...conditions, flatDesignDay: flat })}
            style={{
              ...button,
              fontSize: 9.5,
              padding: '3px 8px',
              borderColor: conditions.flatDesignDay === flat ? 'var(--gain)' : 'var(--border)',
              color: conditions.flatDesignDay === flat ? 'var(--gain)' : 'var(--muted)',
            }}
          >
            {label}
          </button>
        ))}
        {conditions.flatDesignDay && (
          <span style={{ color: 'var(--loss)', flexBasis: '100%' }}>
            Held at the minimum for all 24 hours — comparable to a load calculation, not to the building.
          </span>
        )}
      </div>
      </section>

      {WEATHER_FILE_UI ? (
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
        className="panel"
        style={{
          borderStyle: 'dashed',
          borderColor: dragging ? 'var(--gain)' : 'var(--border)',
          background: dragging ? 'var(--page)' : 'var(--panel)',
          padding: '9px 14px',
          display: 'flex',
          gap: 9,
          alignItems: 'center',
          alignContent: 'center',
          flexWrap: 'wrap',
          fontSize: 10.5,
          color: 'var(--muted)',
        }}
      >
        <h2 className="eyebrow" style={{ font: 'inherit', margin: 0, flexBasis: '100%' }}>
          Weather file
        </h2>
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
        <span style={{ flex: 1, minWidth: 170 }}>
          Or drop one here — read in your browser, nothing uploaded. A <code>.ddy</code> beside the{' '}
          <code>.epw</code> supplies the published ASHRAE minimum.
        </span>
      </div>
      ) : (
        <HowItWorks />
      )}
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
    </div>
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
