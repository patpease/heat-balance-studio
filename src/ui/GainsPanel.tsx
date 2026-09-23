import { Fragment, useState } from 'react';

import { occupantCount } from '../engine/gains';
import { applyGainPreset, IT_PRESETS, setDensity, setItCooling, setOccupancyMode, setScheduleHour } from '../model/editGains';
import type { DensityField, ScheduleField } from '../model/editGains';
import { HELP, IT_COOLING } from '../config/copy';
import { GAIN_PRESETS } from '../model/gainPresets';
import type { Gains, ItCooling, UnitSystem } from '../model/types';
import {
  CUBIC_METRES_PER_SECOND_PER_CFM,
  HEAT_RECOVERY,
  recoveryDevice,
  recoveryMatching,
  SQUARE_METRES_PER_SQUARE_FOOT,
  ventilationFractions,
} from '../model/ventilation';
import type { Ventilation, VentilationSchedule } from '../model/ventilation';
import { fromSqFt, fromWattsPerSqFt, LABELS, toBtuH, toBtuHFt2, toSqFt, toWattsPerSqFt } from '../model/units';
import { grouped } from './format';
import { NumberCell } from './NumberCell';
import { ScheduleBars } from './ScheduleBars';

/**
 * Internal gains, and the ventilation that answers them.
 *
 * Four gain rows, because equipment behaves two different ways at the hour the
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
 * ## Why ventilation is here
 *
 * It is a LOSS sitting in a box of gains, and it is here anyway because its
 * inputs are shaped like the occupancy input directly above it — a per-person
 * rate, a per-area rate, and a schedule — and because it is the same people
 * driving both. It had its own panel for one revision and that panel cost 280
 * px to say what three lines say here. The heading names it, and its strip is
 * drawn in the loss colour, so nothing here claims ventilation is a gain.
 *
 * ## Why there is so little prose
 *
 * Every provenance note, every caveat and every piece of coaching that used to
 * sit under these rows is now either behind a row's `?` or in the assumptions
 * panel at the foot of the page. The rows are inputs; a box of inputs that is
 * half paragraphs is a box that gets skipped.
 */

export interface GainsPanelProps {
  readonly gains: Gains;
  readonly floorArea: number;
  readonly units: UnitSystem;
  /** The worst hour, drawn as a playhead across every strip. */
  readonly marker: number | null;
  readonly onChange: (gains: Gains) => void;
  readonly ventilation: Ventilation;
  readonly onVentilationChange: (next: Ventilation) => void;
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

/**
 * The input column, fixed rather than minimum.
 *
 * `minWidth` let the people row — which carries a derived count as well as its
 * field — push its own strip 61 px right of the other three, so four schedules
 * meant to be read as one picture started in two different places. Wide enough
 * for the widest row, which is ventilation's two rates.
 */
const VALUES_WIDTH = 256;
/** Label column plus the row gap: where every sub-line under a row starts. */
const SUB_INDENT = 132;

export function GainsPanel({
  gains,
  floorArea,
  units,
  marker,
  onChange,
  ventilation,
  onVentilationChange,
}: GainsPanelProps) {
  const [open, setOpen] = useState<string | null>(null);
  const labels = LABELS[units];
  const ip = units === 'IP';

  const people = occupantCount(gains, floorArea);

  /**
   * Which type the picker is showing.
   *
   * Read off `sourceId`, so it survives an edit: the numbers may no longer be
   * the published ones but the building is still the building. `preset` going
   * null is what turns the badge into "Warehouse — edited"; it does not change
   * the selection or the drawing.
   *
   * An unmatched source MUST still render its own option. A bare `value=""`
   * with no matching option makes the browser fall back to the FIRST one, so
   * the control sat on "Assembly" while the page showed the office worked
   * example — a select that confidently names the wrong building type is worse
   * than one that admits it does not know.
   */
  const selected = GAIN_PRESETS.find((preset) => preset.id === gains.sourceId) ?? null;
  const isEdited = gains.preset === null;

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

  /** m³/s per person ⇄ cfm/person under IP, L/s·person under SI. */
  const showPerPerson = (v: number) => (ip ? v / CUBIC_METRES_PER_SECOND_PER_CFM : v * 1000);
  const takePerPerson = (v: number) => (ip ? v * CUBIC_METRES_PER_SECOND_PER_CFM : v / 1000);

  /** m³/s per m² ⇄ cfm/ft² under IP, L/s·m² under SI. */
  const showPerArea = (v: number) =>
    ip ? (v * SQUARE_METRES_PER_SQUARE_FOOT) / CUBIC_METRES_PER_SECOND_PER_CFM : v * 1000;
  const takePerArea = (v: number) =>
    ip ? (v * CUBIC_METRES_PER_SECOND_PER_CFM) / SQUARE_METRES_PER_SQUARE_FOOT : v / 1000;

  const designFlow = ventilation.perPerson * people + ventilation.perArea * floorArea;
  const ventOpen = open === 'ventilation';
  const device = recoveryDevice(ventilation.recovery ?? 'none');

  const rowLabel = (key: string, text: string) => (
    <button
      type="button"
      onClick={() => setOpen(open === key ? null : key)}
      aria-expanded={open === key}
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
      {text}
      <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{open === key ? '−' : '?'}</span>
    </button>
  );

  return (
    <section className="panel cq" style={{ padding: 0, overflow: 'hidden' }}>
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
        <h2 className="eyebrow" style={{ font: 'inherit', margin: 0 }}>Internal gains and ventilation</h2>
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
          {gains.preset ?? (selected ? `${selected.label} — edited` : 'Edited')}
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
        {/* Choosing the type you are already on fires no change event, so an
            edited project would otherwise have no way back to the published
            numbers. */}
        {isEdited && selected && (
          <button
            type="button"
            onClick={() => onChange(applyGainPreset(gains, selected))}
            style={{
              font: 'inherit',
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              padding: '4px 9px',
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--gain)',
              cursor: 'pointer',
            }}
          >
            Reset to {selected.label}
          </button>
        )}
      </div>

      <div style={{ padding: '6px 18px 14px' }}>
        {ROWS.map((row) => {
          const isOpen = open === row.key;
          return (
            <Fragment key={row.key}>
            <div style={{ borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
              <div className="gains-line" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                {rowLabel(row.key, row.label)}

                <div className="gains-values" style={{ ...values }}>
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
                  {/* 'raw', not 'power': kW is kW in both unit systems, and a
                      conversion here would be a bug with no symptom — the
                      number would still look like a plausible IT load. */}
                  {row.key === 'itEquipment' && (
                    <>
                      {density('itEquipment', gains.itEquipment.kilowatts, 1, 'raw', 'IT equipment load')}
                      <span style={unit}>kW</span>
                    </>
                  )}
                </div>

                <ScheduleBars
                  label={row.label}
                  fractions={gains.schedules[row.schedule].fractions}
                  marker={marker}
                  onChange={(hour, fraction) => onChange(setScheduleHour(gains, row.schedule, hour, fraction))}
                />

                {/* Derived, and therefore right of the strip rather than in the
                    input column — which is what let the columns line up. */}
                {row.key === 'people' && (
                  <span style={unit}>= {grouped(Math.round(people))} people</span>
                )}
                {row.key === 'itEquipment' && gains.itEquipment.kilowatts > 0 && floorArea > 0 && gains.itEquipment.cooling === 'air' && (
                  <span style={unit}>
                    ={' '}
                    {(ip
                      ? toBtuHFt2((gains.itEquipment.kilowatts * 1000) / floorArea)
                      : (gains.itEquipment.kilowatts * 1000) / floorArea
                    ).toFixed(2)}{' '}
                    {labels.heatFlux}
                  </span>
                )}
              </div>

              {row.key === 'people' && gains.occupancy.mode === 'density' && (
                <div className="gains-sub" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: `8px 0 0 ${SUB_INDENT}px` }}>
                  {density('sensiblePerPerson', gains.occupancy.sensiblePerPerson, 0, 'heat', 'Sensible heat per person')}
                  <span style={unit}>{labels.perPersonHeat} sensible per person</span>
                </div>
              )}

              {row.key === 'itEquipment' && (
                <div className="gains-sub" style={{ display: 'flex', gap: 6, margin: `8px 0 0 ${SUB_INDENT}px`, flexWrap: 'wrap' }}>
                  {IT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.note}
                      onClick={() =>
                        onChange(
                          setItCooling(
                            setDensity(gains, 'itEquipment', preset.kilowatts),
                            preset.cooling,
                          ),
                        )
                      }
                      style={{
                        ...chip,
                        borderColor:
                          Math.abs(gains.itEquipment.kilowatts - preset.kilowatts) < 0.001 &&
                          gains.itEquipment.cooling === preset.cooling
                            ? 'var(--gain)'
                            : 'var(--border)',
                      }}
                    >
                      {preset.label}
                      {preset.kilowatts > 0 && (
                        <span style={{ color: 'var(--muted)' }}> {preset.kilowatts} kW</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* What is cooling the racks decides what their heat is worth —
                  a gain to this room, heat a recovery chiller can fetch, or
                  nothing. This replaced a hidden φ that was held at 1.0 and
                  asserted that every watt of a 400 kW hall warmed the room.

                  The note that used to sit under these three buttons is now on
                  each button's own title and in the assumptions panel. */}
              {row.key === 'itEquipment' && gains.itEquipment.kilowatts > 0 && (
                <div
                  role="group"
                  aria-label="IT cooling"
                  className="gains-sub"
                  style={{ display: 'flex', gap: 6, margin: `6px 0 0 ${SUB_INDENT}px`, flexWrap: 'wrap', alignItems: 'center' }}
                >
                  <span style={unit}>Cooled by</span>
                  {(Object.keys(IT_COOLING) as ItCooling[]).map((medium) => {
                    const active = gains.itEquipment.cooling === medium;
                    return (
                      <button
                        key={medium}
                        type="button"
                        title={IT_COOLING[medium].note}
                        aria-pressed={active}
                        onClick={() => onChange(setItCooling(gains, medium))}
                        /* Every branch names a colour.
                         *
                         * This read `: undefined` for the inactive and
                         * active-air cases, which does not fall back to the
                         * `color` `chip` sets two lines above — it DELETES it,
                         * so the button took the UA's `buttontext`. On an OS
                         * asking for dark with the app pinned to light that is
                         * white on cream: 1.04:1, and invisible. The three
                         * chips here were the only controls in the tool that
                         * did not set their own colour, which is why they were
                         * the only ones that showed it. */
                        style={{
                          ...chip,
                          borderColor: active
                            ? medium === 'chilled-water'
                              ? 'var(--recover)'
                              : 'var(--gain)'
                            : 'var(--border)',
                          color: active
                            ? medium === 'chilled-water'
                              ? 'var(--recover)'
                              : 'var(--gain)'
                            : 'var(--muted)',
                        }}
                      >
                        {IT_COOLING[medium].label}
                      </button>
                    );
                  })}
                </div>
              )}

              {isOpen && (
                <p className="gains-sub" style={{ ...helpText, margin: `8px 0 0 ${SUB_INDENT}px` }}>
                  {row.help}
                  {row.key === 'itEquipment' && <> {HELP.itCooling}</>}
                </p>
              )}
            </div>

            {/* Ventilation sits under occupancy because it is driven by the
                occupancy: the per-person rate above decides most of it. */}
            {row.key === 'people' && (
              <div style={{ borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
                <div className="gains-line" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  {rowLabel('ventilation', 'Ventilation')}

                  <div className="gains-values" style={{ ...values }}>
                    <NumberCell
                      label="Ventilation per person"
                      value={showPerPerson(ventilation.perPerson)}
                      decimals={ip ? 1 : 2}
                      onCommit={(next) =>
                        onVentilationChange({ ...ventilation, perPerson: Math.max(0, takePerPerson(next)) })
                      }
                      style={{ width: 54 }}
                    />
                    <span style={unit}>{ip ? 'cfm/person' : 'L/s·person'}</span>
                    <span style={unit}>+</span>
                    <NumberCell
                      label="Ventilation per area"
                      value={showPerArea(ventilation.perArea)}
                      decimals={2}
                      onCommit={(next) =>
                        onVentilationChange({ ...ventilation, perArea: Math.max(0, takePerArea(next)) })
                      }
                      style={{ width: 54 }}
                    />
                    <span style={unit}>{ip ? 'cfm/ft²' : 'L/s·m²'}</span>
                  </div>

                  {/* Read-only: the fan has two settings, not 24 numbers. Loss
                      toned, because this row is the only one in the box that
                      takes heat out. */}
                  <ScheduleBars
                    label="Ventilation"
                    fractions={ventilationFractions(ventilation, gains.schedules.occupancy)}
                    marker={marker}
                    readOnly
                    tone="loss"
                    onChange={() => {}}
                  />

                  <span style={unit}>
                    = {grouped(ip ? designFlow / CUBIC_METRES_PER_SECOND_PER_CFM : designFlow * 1000)}{' '}
                    {ip ? 'cfm' : 'L/s'}
                  </span>
                </div>

                <div
                  className="gains-sub"
                  style={{
                    display: 'flex',
                    gap: 6,
                    margin: `8px 0 0 ${SUB_INDENT}px`,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  <span style={unit}>Fan runs</span>
                  {([
                    { id: 'constant' as VentilationSchedule, label: 'Constantly' },
                    { id: 'occupancy' as VentilationSchedule, label: 'With occupancy' },
                  ]).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={ventilation.schedule === id}
                      onClick={() => onVentilationChange({ ...ventilation, schedule: id })}
                      style={{
                        ...chip,
                        borderColor: ventilation.schedule === id ? 'var(--gain)' : 'var(--border)',
                        color: ventilation.schedule === id ? 'var(--gain)' : 'var(--muted)',
                      }}
                    >
                      {label}
                    </button>
                  ))}

                  <span style={{ ...unit, marginLeft: 10 }}>Heat recovery</span>
                  {HEAT_RECOVERY.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      title={`${d.note}${d.range === '—' ? '' : ` (${d.range}, IBPSA-USA BEMP)`}`}
                      aria-pressed={ventilation.recovery === d.id}
                      onClick={() =>
                        onVentilationChange({ ...ventilation, recovery: d.id, effectiveness: d.effectiveness })
                      }
                      style={{
                        ...chip,
                        borderColor: ventilation.recovery === d.id ? 'var(--recover)' : 'var(--border)',
                        color: ventilation.recovery === d.id ? 'var(--recover)' : 'var(--muted)',
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                  {/* Field and unit as ONE flex item. Left loose they wrap
                      apart, and a lone "75" at the end of a line of device
                      names is a number with nothing to say. */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <NumberCell
                      label="Recovery effectiveness"
                      value={ventilation.effectiveness * 100}
                      decimals={0}
                      onCommit={(next) => {
                        const effectiveness = Math.min(1, Math.max(0, next / 100));
                        onVentilationChange({
                          ...ventilation,
                          effectiveness,
                          recovery: recoveryMatching(effectiveness),
                        });
                      }}
                      style={{ width: 34 }}
                    />
                    <span style={unit}>% sensible</span>
                  </span>
                </div>

                {ventOpen && (
                  <p className="gains-sub" style={{ ...helpText, margin: `8px 0 0 ${SUB_INDENT}px` }}>
                    {HELP.ventilationRate} {HELP.ventilationSchedule}
                    {ventilation.effectiveness > 0 && (
                      <>
                        {' '}
                        {device.label === 'None' ? 'This recovery' : device.label} hands{' '}
                        {Math.round(ventilation.effectiveness * 100)}% of the heat in the air leaving to
                        the air coming in. {device.note}
                      </>
                    )}
                  </p>
                )}
              </div>
            )}
            </Fragment>
          );
        })}

        <p style={{ margin: '10px 0 0', fontSize: 10.5, color: 'var(--muted)' }}>
          Drag a bar to edit a schedule, or use the arrow keys. The red rule is the worst hour.
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

const helpText: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--muted)',
  maxWidth: '86ch',
  lineHeight: 1.5,
};

const values: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: VALUES_WIDTH,
  flex: `0 0 ${VALUES_WIDTH}px`,
};
