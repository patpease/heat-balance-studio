import { HELP, VENTILATION_NOTE } from '../config/copy';
import { occupantCount } from '../engine/gains';
import { ventilationConductance } from '../engine/ua';
import {
  CUBIC_METRES_PER_SECOND_PER_CFM,
  HEAT_RECOVERY,
  recoveryDevice,
  recoveryMatching,
  SQUARE_METRES_PER_SQUARE_FOOT,
} from '../model/ventilation';
import type { Ventilation, VentilationSchedule } from '../model/ventilation';
import type { Conditions, Envelope, Gains, UnitSystem } from '../model/types';
import { LABELS } from '../model/units';
import { grouped, heatFlow } from './format';
import { NumberCell } from './NumberCell';

/**
 * Mechanical ventilation, and the heat recovery on it.
 *
 * Entered like a gain and counted like a loss, which is the shape of the thing:
 * a rate somebody specified, a schedule somebody chose, and a device somebody
 * may or may not have bought. Infiltration got a grade and a single field
 * because nobody chooses their leakage; this gets four controls because every
 * one of them is a decision.
 *
 * It sits below the fold beside the gains rather than in the envelope panel,
 * because its inputs look like the gains' inputs and because the envelope panel
 * has no room. Its LOSS appears in the envelope table with the surfaces, which
 * is where it has to compete for attention — and where it usually wins.
 */
export interface VentilationPanelProps {
  readonly ventilation: Ventilation;
  readonly gains: Gains;
  readonly envelope: Envelope;
  readonly conditions: Conditions;
  readonly units: UnitSystem;
  readonly onChange: (next: Ventilation) => void;
}

const chip: React.CSSProperties = {
  font: 'inherit',
  fontSize: 10,
  padding: '3px 9px',
  background: 'var(--page)',
  border: '1px solid var(--border)',
  color: 'var(--muted)',
  cursor: 'pointer',
};

export function VentilationPanel({
  ventilation,
  gains,
  envelope,
  conditions,
  units,
  onChange,
}: VentilationPanelProps) {
  const ip = units === 'IP';
  const labels = LABELS[units];
  const people = occupantCount(gains, envelope.floorArea);

  /** m³/s per person ⇄ cfm/person under IP, L/s·person under SI. */
  const showPerPerson = (v: number) => (ip ? v / CUBIC_METRES_PER_SECOND_PER_CFM : v * 1000);
  const takePerPerson = (v: number) => (ip ? v * CUBIC_METRES_PER_SECOND_PER_CFM : v / 1000);

  /** m³/s per m² ⇄ cfm/ft² under IP, L/s·m² under SI. */
  const showPerArea = (v: number) =>
    ip ? (v * SQUARE_METRES_PER_SQUARE_FOOT) / CUBIC_METRES_PER_SECOND_PER_CFM : v * 1000;
  const takePerArea = (v: number) =>
    ip ? (v * CUBIC_METRES_PER_SECOND_PER_CFM) / SQUARE_METRES_PER_SQUARE_FOOT : v / 1000;

  const designFlow = ventilation.perPerson * people + ventilation.perArea * envelope.floorArea;
  const withoutRecovery = ventilationConductance(
    { ...ventilation, effectiveness: 0 },
    envelope,
    people,
    conditions,
  );
  const withRecovery = ventilationConductance(ventilation, envelope, people, conditions);
  const device = recoveryDevice(ventilation.recovery ?? 'none');

  const row: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
    fontSize: 11,
  };
  const unit: React.CSSProperties = { fontSize: 10.5, color: 'var(--muted)' };

  return (
    <section className="panel" style={{ padding: '10px 16px', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h2 className="eyebrow" style={{ font: 'inherit', margin: 0 }}>
          Ventilation
        </h2>
        <span style={unit}>{VENTILATION_NOTE}</span>
      </div>

      <div style={row}>
        <span style={{ minWidth: 118, color: 'var(--ink)' }}>Outdoor air</span>
        <NumberCell
          label="Ventilation per person"
          value={showPerPerson(ventilation.perPerson)}
          decimals={ip ? 1 : 2}
          onCommit={(next) => onChange({ ...ventilation, perPerson: Math.max(0, takePerPerson(next)) })}
          style={{ width: 62, border: '1px solid var(--border)', background: 'var(--page)' }}
        />
        <span style={unit}>{ip ? 'cfm/person' : 'L/s·person'}</span>
        <span style={unit}>+</span>
        <NumberCell
          label="Ventilation per area"
          value={showPerArea(ventilation.perArea)}
          decimals={2}
          onCommit={(next) => onChange({ ...ventilation, perArea: Math.max(0, takePerArea(next)) })}
          style={{ width: 62, border: '1px solid var(--border)', background: 'var(--page)' }}
        />
        <span style={unit}>{ip ? 'cfm/ft²' : 'L/s·m²'}</span>
        <span style={unit}>
          = {grouped(ip ? designFlow / CUBIC_METRES_PER_SECOND_PER_CFM : designFlow * 1000)}{' '}
          {ip ? 'cfm' : 'L/s'} for {grouped(people)} people over{' '}
          {grouped(ip ? envelope.floorArea * 10.7639104 : envelope.floorArea)} {labels.area}
        </span>
      </div>

      <div style={row}>
        <span style={{ minWidth: 118, color: 'var(--ink)' }}>Fan runs</span>
        {([
          { id: 'constant' as VentilationSchedule, label: 'Constantly' },
          { id: 'occupancy' as VentilationSchedule, label: 'With occupancy' },
        ]).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={ventilation.schedule === id}
            onClick={() => onChange({ ...ventilation, schedule: id })}
            style={{
              ...chip,
              borderColor: ventilation.schedule === id ? 'var(--gain)' : 'var(--border)',
              color: ventilation.schedule === id ? 'var(--gain)' : 'var(--muted)',
            }}
          >
            {label}
          </button>
        ))}
        <span style={unit}>{HELP.ventilationSchedule}</span>
      </div>

      <div style={row}>
        <span style={{ minWidth: 118, color: 'var(--ink)' }}>Heat recovery</span>
        {HEAT_RECOVERY.map((d) => (
          <button
            key={d.id}
            type="button"
            title={`${d.note}${d.range === '—' ? '' : ` (${d.range}, IBPSA-USA BEMP)`}`}
            aria-pressed={ventilation.recovery === d.id}
            onClick={() =>
              onChange({ ...ventilation, recovery: d.id, effectiveness: d.effectiveness })
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
        <NumberCell
          label="Recovery effectiveness"
          value={ventilation.effectiveness * 100}
          decimals={0}
          onCommit={(next) => {
            const effectiveness = Math.min(1, Math.max(0, next / 100));
            onChange({ ...ventilation, effectiveness, recovery: recoveryMatching(effectiveness) });
          }}
          style={{ width: 48, border: '1px solid var(--border)', background: 'var(--page)' }}
        />
        <span style={unit}>% sensible</span>
      </div>

      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', maxWidth: '78ch', lineHeight: 1.5 }}>
        {ventilation.effectiveness > 0 ? (
          <>
            <span style={{ color: 'var(--recover)' }}>
              {device.label === 'None' ? 'Recovery' : device.label} cuts the ventilation load from{' '}
              {heatFlow(withoutRecovery * 20, units)} to {heatFlow(withRecovery * 20, units)}
            </span>{' '}
            at a 20 K difference — {Math.round(ventilation.effectiveness * 100)}% of the heat in the
            air leaving is handed to the air coming in. {device.note}
          </>
        ) : (
          <>
            No recovery: every watt of outdoor air is heated from ambient. At a 20 K difference this
            ventilation costs {heatFlow(withoutRecovery * 20, units)}.{' '}
            {HEAT_RECOVERY[4]!.label} at {Math.round(HEAT_RECOVERY[4]!.effectiveness * 100)}% would
            leave {heatFlow(withoutRecovery * (1 - HEAT_RECOVERY[4]!.effectiveness) * 20, units)}.
          </>
        )}
      </p>
    </section>
  );
}
