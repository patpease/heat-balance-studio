import { useMemo, useState } from 'react';

import { referenceWatts } from '../chart/arrowScale';
import { SectionDrawing } from '../chart/SectionDrawing';
import type { SectionTerm } from '../chart/SectionDrawing';
import { solve } from '../engine/balance';
import { areasFromBox, DEFAULT_BOX } from '../engine/sketchBox';
import type { BoxDimensions } from '../engine/sketchBox';
import { wallToFloorRatio } from '../engine/ua';
import { OFFICE } from '../model/buildingTypes';
import type { Conditions, DesignDay, Envelope, Gains, Surface, SurfaceSlot, UnitSystem } from '../model/types';
import { fromBtuU, fromSqFt, LABELS, rToU, toBtuU, toSqFt, uToR } from '../model/units';
import { cellStyle as cell, NumberCell } from './NumberCell';

/**
 * Envelope entry.
 *
 * The drawing IS the control: clicking a surface selects its row and clicking a
 * row highlights its arrow, both directions. And the drawing is not decoration —
 * arrow length and weight are proportional to that surface's actual loss, so it
 * doubles as the conductance breakdown.
 *
 * The section is schematic and deliberately does not redraw itself to the
 * entered dimensions: plausible numbers would produce absurd geometry, and the
 * quantity a user is reasoning about is share of loss, not proportions.
 */

export interface EnvelopePanelProps {
  readonly envelope: Envelope;
  /** The LIVE gains — solving with a default here would make these arrows
   *  disagree with the verdict sitting beside them. */
  readonly gains: Gains;
  readonly conditions: Conditions;
  readonly designDay: DesignDay;
  readonly units: UnitSystem;
  /** The hour the chart is being hovered over, or null to sit on the worst. */
  readonly scrubHour: number | null;
  readonly onChange: (envelope: Envelope) => void;
  readonly onExport: () => void;
  readonly exporting: boolean;
}

export function EnvelopePanel({
  envelope,
  gains,
  conditions,
  designDay,
  units,
  scrubHour,
  onChange,
  onExport,
  exporting,
}: EnvelopePanelProps) {
  const [selected, setSelected] = useState<SurfaceSlot | null>(null);
  const [box, setBox] = useState<BoxDimensions>(DEFAULT_BOX);
  const [sketch, setSketch] = useState(true);

  const result = useMemo(
    () => solve({ envelope, gains, conditions, designDay }),
    [envelope, gains, conditions, designDay],
  );

  // ONE reference across all 24 hours, so scrubbing later shows the gains
  // genuinely collapsing rather than the drawing renormalising under them.
  const reference = useMemo(
    () => referenceWatts(result.hours.flatMap((h) => [...h.lossTerms, ...h.gainTerms].map((t) => t.watts))),
    [result],
  );

  const shownHour = scrubHour ?? result.worstHour;
  const worst = result.hours[shownHour]!;
  const terms: SectionTerm[] = [...worst.lossTerms, ...worst.gainTerms];
  const labels = LABELS[units];

  const applyBox = () => {
    const areas = areasFromBox(box);
    const byCategory: Record<string, number> = {
      wall: areas.wallArea,
      window: areas.windowArea,
      roof: areas.roofArea,
      groundFloor: areas.groundFloorArea,
      exposedFloor: areas.exposedFloorArea,
    };
    onChange({
      ...envelope,
      floorArea: areas.floorArea,
      storeyHeight: box.storeyHeight,
      storeys: box.storeys,
      surfaces: envelope.surfaces.map((s) => ({ ...s, area: byCategory[s.category] ?? s.area })),
    });
  };

  const setSurface = (id: string, patch: Partial<Surface>) => {
    onChange({
      ...envelope,
      surfaces: envelope.surfaces.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const slotFor = (s: Surface): SurfaceSlot =>
    ({
      wall: 'loss-walls',
      window: 'loss-windows',
      roof: 'loss-roof',
      groundFloor: 'loss-ground-floor',
      exposedFloor: 'loss-exposed-floor',
    } as const)[s.category];

  return (
    <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span className="eyebrow">
          Section — {String(shownHour).padStart(2, '0')}:00
          {scrubHour === null ? ', the worst hour' : ''}
        </span>
        <button
          type="button"
          onClick={() => setSketch((v) => !v)}
          style={{
            font: 'inherit',
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--gain)',
            background: 'none',
            border: '1px solid var(--border)',
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          Sketch {sketch ? 'on' : 'off'}
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          style={{
            font: 'inherit',
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--gain)',
            background: 'none',
            border: '1px solid var(--border)',
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          {exporting ? 'Exporting…' : 'Export PNG'}
        </button>
      </header>

      <div style={{ padding: '8px 8px 0' }}>
        <SectionDrawing
          type={OFFICE}
          terms={terms}
          reference={reference}
          sketch={sketch}
          selected={selected}
          onSelect={(slot) => setSelected((current) => (current === slot ? null : slot))}
        />
      </div>

      <div style={{ padding: '4px 18px 18px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Surface', `Area, ${labels.area}`, `U, ${labels.uValue}`, `R, ${labels.rValue}`, 'Loss at worst hour'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === 'Surface' ? 'left' : 'right',
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                    fontWeight: 500,
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {envelope.surfaces.map((surface) => {
              const slot = slotFor(surface);
              const term = worst.lossTerms.find((t) => t.slot === slot);
              const isSelected = selected === slot;
              const empty = surface.area <= 0;
              return (
                <tr
                  key={surface.id}
                  onClick={() => setSelected((current) => (current === slot ? null : slot))}
                  style={{
                    cursor: 'pointer',
                    background: isSelected ? 'var(--page)' : undefined,
                    opacity: empty ? 0.55 : 1,
                  }}
                >
                  <td style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    {surface.label}
                    {surface.boundary === 'ground' && (
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                        {' '}· ground at 55 °F
                      </span>
                    )}
                  </td>
                  <td style={cell}>
                    <NumberCell
                      value={units === 'IP' ? toSqFt(surface.area) : surface.area}
                      decimals={0}
                      onCommit={(next) =>
                        setSurface(surface.id, { area: Math.max(0, units === 'IP' ? fromSqFt(next) : next) })
                      }
                    />
                  </td>
                  <td style={cell}>
                    <NumberCell
                      value={units === 'IP' ? toBtuU(surface.uValue) : surface.uValue}
                      decimals={3}
                      onCommit={(next) =>
                        next > 0 && setSurface(surface.id, { uValue: units === 'IP' ? fromBtuU(next) : next })
                      }
                    />
                  </td>
                  {/* R is the same value seen through a reciprocal. Editing
                      either must land on the same stored U — the conversion is
                      the one place in this tool a unit bug is silent. */}
                  <td style={cell}>
                    <NumberCell
                      value={surface.uValue > 0 ? uToR(surface.uValue, units) : 0}
                      decimals={1}
                      onCommit={(next) => next > 0 && setSurface(surface.id, { uValue: rToU(next, units) })}
                    />
                  </td>
                  <td style={{ textAlign: 'right', padding: '7px 0', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', color: empty ? undefined : 'var(--loss)' }}>
                    {empty ? '—' : `${Math.round(term?.watts ?? 0).toLocaleString('en-US')} W`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--muted)' }}>
          U-values are assembly averages including thermal bridges — the tool has no bridge model.
          Every surface faces outdoor air or the ground; there is no buffer boundary in v1.
        </p>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 14, alignItems: 'flex-end' }}>
          {(
            [
              ['Length', 'length'],
              ['Width', 'width'],
              ['Storey height', 'storeyHeight'],
              ['Storeys', 'storeys'],
              ['WWR', 'windowToWallRatio'],
            ] as const
          ).map(([label, key]) => (
            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
              <span className="eyebrow">{label}</span>
              <input
                type="number"
                value={box[key]}
                step={key === 'windowToWallRatio' ? 0.05 : 1}
                onChange={(e) => setBox({ ...box, [key]: Number(e.target.value) })}
                style={{
                  font: 'inherit',
                  width: 74,
                  padding: '5px 7px',
                  background: 'var(--page)',
                  color: 'var(--ink)',
                  border: '1px solid var(--border)',
                }}
              />
            </label>
          ))}
          <button
            type="button"
            onClick={applyBox}
            style={{
              font: 'inherit',
              fontSize: 12,
              padding: '7px 14px',
              background: 'var(--gain)',
              color: 'var(--panel)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Sketch a box
          </button>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            Wall-to-floor {wallToFloorRatio(envelope).toFixed(2)}
          </span>
        </div>
      </div>
    </section>
  );
}
