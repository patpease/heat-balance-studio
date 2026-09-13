import { useState } from 'react';

import { occupantCount } from '../engine/gains';
import { applyGainPreset, IT_PRESETS, setDensity, setOccupancyMode, setScheduleHour } from '../model/editGains';
import type { DensityField, ScheduleField } from '../model/editGains';
import { GAINS_SOURCE_NOTE, HELP } from '../config/copy';
import { OFFICE_DENSITIES } from '../model/defaults';
import { GAIN_PRESETS } from '../model/gainPresets';
import type { Gains, UnitSystem } from '../model/types';
import { fromSqFt, fromWattsPerSqFt, LABELS, toBtuH, toSqFt, toWattsPerSqFt } from '../model/units';
import { NumberCell } from './NumberCell';
import { ScheduleBars } from './ScheduleBars';

/**
 * Internal gains.
 *
 * Four rows, because equipment behaves two different ways at the hour the
 * verdict is decided: IT runs flat through the night while misc drops to a
 * standby floor. A watt of 24/7 load is worth roughly three times a watt of
 * scheduled load to this answer, and no single-row model can say that.
 *
 * The building-type picker sets all four densities AND all four schedules from
 * `model/gainPresets.ts`, which is generated from the PNNL prototype
 * scorecards. The schedules are the half that matters most: an apartment sits
 * near full occupancy at 05:00 where an office sits at zero, and the verdict is
 * decided between 04:00 and 07:00.
 *
 * No advanced field appears here. φ — the share of IT power that reaches the
 * conditioned space — is in the schema and the engine applies it, but v1 holds
 * it at 1 and shows no control; the assumption is disclosed in the scope notes
 * instead, because the user cannot change it.
 */

export interface GainsPanelProps {
  readonly gains: Gains;
  readonly floorArea: number;
  readonly units: UnitSystem;
  /** The worst hour, drawn as a playhead across every strip. */
  readonly marker: number | null;
  readonly onChange: (gains: Gains) => void;
}

interface Row {
  readonly key: string;
  readonly label: string;
  readonly schedule: ScheduleField;
  readonly help: string;
}

const ROWS: readonly Row[] = [
  {
    key: 'people',
    label: 'People',
    schedule: 'occupancy',
    help: HELP.people,
  },
  {
    key: 'lighting',
    label: 'Lighting',
    schedule: 'lighting',
    help: HELP.lighting,
  },
  {
    key: 'miscEquipment',
    label: 'Misc equipment',
    schedule: 'miscEquipment',
    help: HELP.miscEquipment,
  },
  {
    key: 'itEquipment',
    label: 'IT equipment',
    schedule: 'itEquipment',
    help: HELP.itEquipment,
  },
];

export function GainsPanel({ gains, floorArea, units, marker, onChange }: GainsPanelProps) {
  const [open, setOpen] = useState<string | null>(null);
  const labels = LABELS[units];
  const ip = units === 'IP';

  const people = occupantCount(gains, floorArea);

  /**
   * Which type the picker is showing, or null when the gains are not one.
   *
   * An unmatched preset MUST render its own option. A bare `value=""` with no
   * matching option makes the browser fall back to the FIRST one, so the
   * control sat on "Assembly" while the page showed the office worked example —
   * a select that confidently names the wrong building type is worse than one
   * that admits it does not know. This happens for the worked example, for any
   * edited state, and for a share link from a build with different presets.
   */
  const selected = GAIN_PRESETS.find((preset) => preset.label === gains.preset) ?? null;

  const density = (
    field: DensityField,
    value: number,
    decimals: number,
    convert: 'area' | 'power' | 'heat' | 'raw',
    label: string,
  ) => {
    const shown =
      convert === 'area' ? (ip ? toSqFt(value) : value)
      : convert === 'power' ? (ip ? toWattsPerSqFt(value) : value)
      : convert === 'heat' ? (ip ? toBtuH(value) : value)
      : value;
    const back = (next: number) =>
      convert === 'area' ? (ip ? fromSqFt(next) : next)
      : convert === 'power' ? (ip ? fromWattsPerSqFt(next) : next)
      : convert === 'heat' ? (ip ? next / 3.412141633 : next)
      : next;
    return (
      <NumberCell
        label={label}
        value={shown}
        decimals={decimals}
        onCommit={(next) => onChange(setDensity(gains, field, back(next)))}
      />
    );
  };

  return (
    <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
        }}
      >
        <h2 className="eyebrow" style={{ font: 'inherit', margin: 0 }}>Internal gains</h2>
        {/* The source badge, and the whole reason editGains exists: it must
            never outlive the number it described. */}
        <span
          style={{
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            padding: '3px 9px',
            border: `1px solid ${gains.preset ? 'var(--gain)' : 'var(--border)'}`,
            color: gains.preset ? 'var(--gain)' : 'var(--muted)',
          }}
        >
          {gains.preset ?? 'Edited'}
        </span>
      </header>

      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '10px 18px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <label htmlFor="building-type" className="eyebrow" style={{ fontSize: 10 }}>
          Building type
        </label>
        <select
          id="building-type"
          value={selected?.id ?? ''}
          onChange={(event) => {
            const preset = GAIN_PRESETS.find((candidate) => candidate.id === event.target.value);
            if (preset) onChange(applyGainPreset(gains, preset));
          }}
          style={{
            font: 'inherit',
            fontSize: 12,
            padding: '5px 7px',
            background: 'var(--page)',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
          }}
        >
          {selected === null && (
            <option value="">{gains.preset ?? 'Edited'} — not a listed type</option>
          )}
          {GAIN_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 10.5, color: 'var(--muted)', maxWidth: '64ch' }}>{GAINS_SOURCE_NOTE}</span>
      </div>

      <div style={{ padding: '6px 18px 16px' }}>
        {ROWS.map((row) => {
          const isOpen = open === row.key;
          return (
            <div key={row.key} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : row.key)}
                  aria-expanded={isOpen}
                  style={{
                    font: 'inherit',
                    fontSize: 13,
                    width: 118,
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: 'var(--ink)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {row.label}
                  <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{isOpen ? '−' : '?'}</span>
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 210 }}>
                  {row.key === 'people' && (
                    <>
                      {gains.occupancy.mode === 'density'
                        ? density('areaPerPerson', gains.occupancy.areaPerPerson, 0, 'area', 'Area per person')
                        : density('count', gains.occupancy.count, 0, 'raw', 'Number of people')}
                      <button
                        type="button"
                        onClick={() =>
                          onChange(setOccupancyMode(gains, gains.occupancy.mode === 'density' ? 'count' : 'density'))
                        }
                        style={chip}
                      >
                        {gains.occupancy.mode === 'density' ? labels.areaPerPerson : 'people'}
                      </button>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        = {Math.round(people)} people
                      </span>
                    </>
                  )}
                  {row.key === 'lighting' && (
                    <>
                      {density('lighting', gains.lighting.powerDensity, 2, 'power', 'Lighting power density')}
                      <span style={unit}>{labels.powerDensity}</span>
                    </>
                  )}
                  {row.key === 'miscEquipment' && (
                    <>
                      {density('miscEquipment', gains.miscEquipment.powerDensity, 2, 'power', 'Misc equipment power density')}
                      <span style={unit}>{labels.powerDensity}</span>
                    </>
                  )}
                  {row.key === 'itEquipment' && (
                    <>
                      {density('itEquipment', gains.itEquipment.powerDensity, 2, 'power', 'IT equipment power density')}
                      <span style={unit}>{labels.powerDensity}</span>
                    </>
                  )}
                </div>

                <ScheduleBars
                  label={row.label}
                  fractions={gains.schedules[row.schedule].fractions}
                  marker={marker}
                  onChange={(hour, fraction) => onChange(setScheduleHour(gains, row.schedule, hour, fraction))}
                />
              </div>

              {row.key === 'people' && gains.occupancy.mode === 'density' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 0 132px' }}>
                  {density('sensiblePerPerson', gains.occupancy.sensiblePerPerson, 0, 'heat', 'Sensible heat per person')}
                  <span style={unit}>{labels.perPersonHeat} sensible per person</span>
                </div>
              )}

              {row.key === 'itEquipment' && (
                <div style={{ display: 'flex', gap: 6, margin: '8px 0 0 132px', flexWrap: 'wrap' }}>
                  {IT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.note}
                      onClick={() => onChange(setDensity(gains, 'itEquipment', preset.powerDensity))}
                      style={{
                        ...chip,
                        borderColor:
                          Math.abs(gains.itEquipment.powerDensity - preset.powerDensity) < 0.001
                            ? 'var(--gain)'
                            : 'var(--border)',
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}

              {isOpen && (
                <p style={{ margin: '8px 0 0 132px', fontSize: 11, color: 'var(--muted)', maxWidth: '54ch' }}>
                  {row.help}
                  {row.key === 'itEquipment' && (
                    <>
                      {' '}
                      No published default exists — 90.1 does not separate receptacle load into IT and misc, and real
                      values span three orders of magnitude. The presets are provisional.
                    </>
                  )}
                </p>
              )}
            </div>
          );
        })}

        <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--muted)', maxWidth: '62ch' }}>
          Densities and schedules are {gains.preset ? 'the published prototype\u2019s' : 'yours'}.
          The overnight floor decides the answer — the verdict lands between 04:00 and 07:00, so an equipment row that
          drops to zero at night flatters every building. Drag a bar to edit, or use the arrow keys.
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 10, color: 'var(--muted)' }}>
          {OFFICE_DENSITIES.lighting.citation}
        </p>
      </div>
    </section>
  );
}

const chip: React.CSSProperties = {
  font: 'inherit',
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  padding: '3px 8px',
  background: 'none',
  border: '1px solid var(--border)',
  color: 'var(--muted)',
  cursor: 'pointer',
};

const unit: React.CSSProperties = { fontSize: 11, color: 'var(--muted)' };
