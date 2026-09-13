import { useMemo, useState } from 'react';

import { referenceWatts } from '../chart/arrowScale';
import { SectionDrawing } from '../chart/SectionDrawing';
import type { SectionTerm } from '../chart/SectionDrawing';
import { solve } from '../engine/balance';
import { areasFromBox, DEFAULT_BOX } from '../engine/sketchBox';
import type { BoxDimensions } from '../engine/sketchBox';
import { wallToFloorRatio } from '../engine/ua';
import { buildingType } from '../model/buildingTypes';
import { GAIN_PRESETS } from '../model/gainPresets';
import type { Conditions, DesignDay, Envelope, Gains, Surface, SurfaceSlot, UnitSystem } from '../model/types';
import { fromBtuU, fromFt, fromSqFt, LABELS, rToU, toBtuU, toFt, toSqFt, uToR } from '../model/units';
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

const overlayButton: React.CSSProperties = {
  font: 'inherit',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--gain)',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  padding: '3px 8px',
  cursor: 'pointer',
};

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
  const ip = units === 'IP';

  // The drawing follows the building type the gains came FROM, read off
  // `sourceId` rather than off the badge. Reading the badge meant the first
  // edit to any density snapped a warehouse back to an office section, because
  // the badge had gone null — the shape is not what the user changed.
  const massing = buildingType(
    GAIN_PRESETS.find((preset) => preset.id === gains.sourceId)?.massing ?? 'office',
  );

  // The box is held in canonical SI like everything else; IP is a display
  // transform on the way into the field and back out of it. Length, width and
  // storey height are all LENGTHS — storeys and WWR are the only two here that
  // genuinely carry no unit.
  // `aria` must CONTAIN the visible caption, or voice control cannot address a
  // field by the words printed above it (WCAG 2.5.3). Hence "Box WWR,
  // window-to-wall ratio" rather than the expansion alone.
  const boxFields = [
    { key: 'length', caption: `Length, ${labels.length}`, aria: `Box length, ${labels.length}`, decimals: ip ? 0 : 1 },
    { key: 'width', caption: `Width, ${labels.length}`, aria: `Box width, ${labels.length}`, decimals: ip ? 0 : 1 },
    { key: 'height', caption: `Height, ${labels.length}`, aria: `Box height, ${labels.length}`, decimals: 1 },
    { key: 'storeys', caption: 'Storeys', aria: 'Box storeys', decimals: 0 },
    { key: 'windowToWallRatio', caption: 'WWR', aria: 'Box WWR, window-to-wall ratio', decimals: 2 },
  ] as const;

  const isLength = (key: keyof BoxDimensions) =>
    key === 'length' || key === 'width' || key === 'height';

  const showBox = (key: keyof BoxDimensions) =>
    ip && isLength(key) ? toFt(box[key]) : box[key];

  const takeBox = (key: keyof BoxDimensions, typed: number) =>
    setBox({ ...box, [key]: Math.max(0, ip && isLength(key) ? fromFt(typed) : typed) });

  /**
   * Gross floor area is the area the internal gains are multiplied by, so it is
   * the one number in this table that is not a surface and has no U-value.
   *
   * It can never be LESS than the floors that sit on the ground or over air:
   * those are part of it. Equal is the ordinary single-storey case — one
   * footprint, one floor — so only "less than" is wrong.
   *
   * An invalid figure is kept, flagged, and still used. Clamping would overwrite
   * what was typed, and suppressing the verdict would hide the consequence,
   * which is usually the thing that reveals the mistake.
   */
  const floorOnGround = envelope.surfaces
    .filter((surface) => surface.category === 'groundFloor' || surface.category === 'exposedFloor')
    .reduce((total, surface) => total + surface.area, 0);
  const grossFloorTooSmall = envelope.floorArea < floorOnGround - 1e-9;

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
      // Derived from the overall height, which is what the field asks for.
      storeyHeight: areas.storeyHeight,
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
    <section className="panel" style={{ padding: 0, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Title and actions float over the drawing instead of sitting in a bar
          above it. The bar cost 56 px and the drawing needs them more; the
          drawing's own margins are empty at the top, so nothing is covered. */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 14,
          right: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        <h2 className="eyebrow" style={{ font: 'inherit', margin: 0 }}>
          Building envelope — {String(shownHour).padStart(2, '0')}:00
          {scrubHour === null ? ', the worst hour' : ''}
        </h2>
        <span style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>
          <button type="button" onClick={onExport} disabled={exporting} style={overlayButton}>
            {exporting ? 'Exporting…' : 'PNG'}
          </button>
        </span>
      </div>

      <div style={{ padding: '26px 8px 0' }}>
        <SectionDrawing
          type={massing}
          terms={terms}
          reference={reference}
          selected={selected}
          onSelect={(slot) => setSelected((current) => (current === slot ? null : slot))}
        />
      </div>

      <div style={{ padding: '2px 16px 12px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Surface', `Area, ${labels.area}`, `U, ${labels.uValue}`, `R, ${labels.rValue}`, 'Loss at current hour'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === 'Surface' ? 'left' : 'right',
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                    fontWeight: 500,
                    padding: '5px 0',
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
                  <td style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    {surface.label}
                  </td>
                  <td style={cell}>
                    <NumberCell
                      label={`${surface.label} area`}
                      value={units === 'IP' ? toSqFt(surface.area) : surface.area}
                      decimals={0}
                      onCommit={(next) =>
                        setSurface(surface.id, { area: Math.max(0, units === 'IP' ? fromSqFt(next) : next) })
                      }
                    />
                  </td>
                  <td style={cell}>
                    <NumberCell
                      label={`${surface.label} U-value`}
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
                      label={`${surface.label} R-value`}
                      value={surface.uValue > 0 ? uToR(surface.uValue, units) : 0}
                      decimals={1}
                      onCommit={(next) => next > 0 && setSurface(surface.id, { uValue: rToU(next, units) })}
                    />
                  </td>
                  <td style={{ textAlign: 'right', padding: '4px 0', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', color: empty ? undefined : 'var(--loss)' }}>
                    {empty ? '—' : `${Math.round(term?.watts ?? 0).toLocaleString('en-US')} W`}
                  </td>
                </tr>
              );
            })}
            {/* Not a surface: no U, no R, no loss. It earns its place in this
                table because it is the denominator under every per-area figure
                the tool reports, and it was previously settable only through
                the box helper. */}
            <tr>
              <td style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                Gross floor area
              </td>
              <td style={cell}>
                <NumberCell
                  label="Gross floor area"
                  value={units === 'IP' ? toSqFt(envelope.floorArea) : envelope.floorArea}
                  decimals={0}
                  onCommit={(next) =>
                    onChange({
                      ...envelope,
                      floorArea: Math.max(0, units === 'IP' ? fromSqFt(next) : next),
                    })
                  }
                  style={
                    // The full shorthand, not borderColor: NumberCell sets
                    // `border`, and React warns on a rerender that mixes a
                    // shorthand with a longhand for the same property.
                    grossFloorTooSmall ? { border: '1px solid var(--loss)', color: 'var(--loss)' } : {}
                  }
                />
              </td>
              <td style={{ ...cell, color: 'var(--muted)' }}>—</td>
              <td style={{ ...cell, color: 'var(--muted)' }}>—</td>
              <td style={{ textAlign: 'right', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
                drives the gains
              </td>
            </tr>
          </tbody>
        </table>

        {grossFloorTooSmall && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--loss)' }}>
            Gross floor area is below the {Math.round(units === 'IP' ? toSqFt(floorOnGround) : floorOnGround).toLocaleString('en-US')} {labels.area}{' '}
            of ground and exposed floor, which are part of it. The balance below still uses the figure entered.
          </p>
        )}

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, alignItems: 'flex-end' }}>
          {boxFields.map(({ key, caption, aria, decimals }) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
              <span className="eyebrow">{caption}</span>
              <NumberCell
                label={aria}
                value={showBox(key)}
                decimals={decimals}
                onCommit={(next) => takeBox(key, next)}
                style={{
                  width: 66,
                  textAlign: 'left',
                  padding: '3px 6px',
                  background: 'var(--page)',
                  border: '1px solid var(--border)',
                }}
              />
            </div>
          ))}
          {/* In the row, not after it: it acts on the five fields beside it, and
              a button on its own line read as a separate step. */}
          <button
            type="button"
            onClick={applyBox}
            style={{
              font: 'inherit',
              fontSize: 11,
              padding: '4px 12px',
              background: 'var(--gain)',
              color: 'var(--panel)',
              border: 'none',
              cursor: 'pointer',
              alignSelf: 'flex-end',
            }}
          >
            Create surfaces
          </button>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            Wall-to-floor {wallToFloorRatio(envelope).toFixed(2)}
          </span>
        </div>
      </div>
    </section>
  );
}
