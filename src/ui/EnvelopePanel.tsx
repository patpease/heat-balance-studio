import { useId, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { referenceWatts } from '../chart/arrowScale';
import { LOSS_SLOTS, markerNumbers, SectionDrawing } from '../chart/SectionDrawing';
import type { SectionTerm } from '../chart/SectionDrawing';
import { useWidth } from '../chart/useWidth';
import { HELP } from '../config/copy';
import { solve } from '../engine/balance';
import { areasFromBox, DEFAULT_BOX } from '../engine/sketchBox';
import type { BoxDimensions } from '../engine/sketchBox';
import { wallToFloorRatio } from '../engine/ua';
import { AIRTIGHTNESS, gradeMatching, leakageOf, M3S_M2_PER_CFM_FT2 } from '../model/airtightness';
import { buildingType } from '../model/buildingTypes';
import { GAIN_PRESETS } from '../model/gainPresets';
import type { Conditions, DesignDay, Envelope, Gains, Surface, SurfaceSlot, UnitSystem } from '../model/types';
import type { Ventilation } from '../model/ventilation';
import { fromBtuU, fromFt, fromSqFt, LABELS, rToU, toBtuH, toBtuU, toFt, toSqFt, uToR } from '../model/units';
import { grouped } from './format';
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
 *
 * The five sketch-box dimensions are behind a drawer rather than on the face of
 * the panel. They are a ONE-TIME entry — five numbers typed once to fill the
 * table in, and then never looked at again — but they were on screen for the
 * whole of the rest of the session, competing with the drawing and the loss
 * table, which are what the tool is for. The drawer opens in the same column
 * they occupied, so the drawing does not move when it is closed again, and
 * "Create surfaces" closes it: the one action it exists for is also the way
 * out of it.
 */

export interface EnvelopePanelProps {
  readonly envelope: Envelope;
  /** The LIVE gains — solving with a default here would make these arrows
   *  disagree with the verdict sitting beside them. */
  readonly gains: Gains;
  readonly ventilation: Ventilation;
  readonly conditions: Conditions;
  readonly designDay: DesignDay;
  readonly units: UnitSystem;
  /** The hour the chart is being hovered over, or null to sit on the worst. */
  readonly scrubHour: number | null;
  readonly onChange: (envelope: Envelope) => void;
  /**
   * Handed the drawing as it looks on a desk — labelled, not numbered — so the
   * export can shoot that when this panel is showing its phone layout.
   */
  readonly onExport: (standard: ReactElement) => void;
  readonly exporting: boolean;
  /**
   * Rendered between the drawing and the table, splitting the panel in two.
   * Passed only when the page is stacked; see the split below.
   */
  readonly between?: ReactNode;
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
  ventilation,
  conditions,
  designDay,
  units,
  scrubHour,
  onChange,
  onExport,
  exporting,
  between,
}: EnvelopePanelProps) {
  const [selected, setSelected] = useState<SurfaceSlot | null>(null);
  const [box, setBox] = useState<BoxDimensions>(DEFAULT_BOX);
  /**
   * Closed on load, and deliberately not remembered.
   *
   * Local state only — not in the share link, not in storage. A link should
   * land its recipient on the answer, not on the form that produced it.
   */
  const [boxOpen, setBoxOpen] = useState(false);
  // Per instance: the PNG export mounts a second copy of this panel's drawing,
  // and aria-controls pointing at a duplicate id addresses the wrong one.
  const boxDrawerId = useId();
  /**
   * The panel's own width decides its layout, not the viewport's.
   *
   * Under 600 px the table becomes cards (a container query in styles.css) and
   * the drawing swaps its labels for numbered markers (here). Both read the
   * width of this one box, so there is no width at which the cards are
   * showing and the drawing is still labelled, or the other way round.
   */
  const panelRef = useRef<HTMLElement>(null);
  const { compact } = useWidth(panelRef);

  const result = useMemo(
    () => solve({ envelope, gains, conditions, designDay, ventilation }),
    [envelope, gains, conditions, designDay, ventilation],
  );

  // ONE reference across all 24 hours, so scrubbing later shows the gains
  // genuinely collapsing rather than the drawing renormalising under them.
  const reference = useMemo(
    () => referenceWatts(result.hours.flatMap((h) => [...h.lossTerms, ...h.gainTerms].map((t) => t.watts))),
    [result],
  );

  const shownHour = scrubHour ?? result.worstHour;
  const infiltrationWatts =
    result.hours[shownHour]!.lossTerms.find((t) => t.slot === 'loss-infiltration')?.watts ?? 0;
  const ventilationWatts =
    result.hours[shownHour]!.lossTerms.find((t) => t.slot === 'loss-ventilation')?.watts ?? 0;
  const ventilationNote =
    ventilation.effectiveness > 0
      ? `${Math.round(ventilation.effectiveness * 100)}% recovery`
      : 'no heat recovery';
  const worst = result.hours[shownHour]!;
  const terms: SectionTerm[] = [...worst.lossTerms, ...worst.gainTerms];
  const labels = LABELS[units];
  const ip = units === 'IP';

  // A heat FLOW, not a flux. The column carries the whole loss through a
  // surface, so IP wants Btu/h — the chart's Btu/h·ft² is the same quantity
  // divided by an area and would be off by four orders of magnitude here.
  const heatFlow = (watts: number) => (ip ? toBtuH(watts) : watts);

  // The drawing follows the building type the gains came FROM, read off
  // `sourceId` rather than off the badge. Reading the badge meant the first
  // edit to any density snapped a warehouse back to an office section, because
  // the badge had gone null — the shape is not what the user changed.
  const massing = buildingType(
    GAIN_PRESETS.find((preset) => preset.id === gains.sourceId)?.massing ?? 'office',
  );
  // The same map the drawing numbers its markers from, so a card's badge and
  // the dot on the drawing are one number rather than two that agree.
  const numbers = compact ? markerNumbers(massing, terms, reference) : null;
  const badge = (slot: SurfaceSlot) => {
    const number = numbers?.get(slot);
    return number === undefined ? null : (
      <span className="env-badge" data-tone={LOSS_SLOTS.has(slot) ? 'loss' : 'gain'} aria-hidden="true">
        {number}
      </span>
    );
  };

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

  /**
   * Air leakage at 75 Pa, at the display edge.
   *
   * Stored canonical as m³/(s·m²) like everything else. IP shows the cfm/ft²
   * the US standards are written in; SI shows m³/h·m², which is what the
   * European tests report. Two different numbers for one rate, which is the
   * usual arrangement in this tool and the usual place to get it wrong.
   */
  const showLeakage = (leakage: number) =>
    ip ? leakage / M3S_M2_PER_CFM_FT2 : leakage * 3600;
  const takeLeakage = (shown: number) =>
    ip ? shown * M3S_M2_PER_CFM_FT2 : shown / 3600;

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
    // The drawer's one action is also the way out of it: the areas are in the
    // table now, and the table is where they are edited from here on.
    setBoxOpen(false);
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

  // The two halves of the panel: what the drawing is, and what it is made of.
  const drawingPart = (
    <>
      {/* Title and actions float over the drawing instead of sitting in a bar
          above it. The bar cost 56 px and the drawing needs them more; the
          drawing's own margins are empty at the top, so nothing is covered. */}
      {/* Positioned by `.env-bar` rather than inline, because on a phone it
          stops floating: the title wraps to two lines there and a floating
          bar two lines deep sits on top of the roof. */}
      <div className="env-bar">
        {/* Two items, not three. Wall-to-floor lived here for one revision and
            the bar could not hold it: title, ratio and export button came to
            624 px in a 620 px bar, so the button wrapped to a second line. It
            has gone to the gross floor area row, which is a better home anyway.

            "worst hour", not "the worst hour". The article was first dropped to
            make room for the ratio; the room came back and the shorter title
            was kept on its own merits. At this eyebrow's tracking it is 44 px,
            and the bar now has 167 px of slack — so this is taste, not fit, and
            re-adding "the" would break nothing. */}
        <h2 className="eyebrow" style={{ font: 'inherit', margin: 0 }}>
          Building definition — {String(shownHour).padStart(2, '0')}:00
          {scrubHour === null ? ', worst hour' : ''}
        </h2>
        <span style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>
          {/* The handle for the dimensions drawer. It sits in the bar rather
              than in the column, because the column is the thing it opens —
              a handle inside the drawer has nowhere to be when it is shut. */}
          <button
            type="button"
            onClick={() => setBoxOpen((on) => !on)}
            aria-expanded={boxOpen}
            aria-controls={boxDrawerId}
            title={HELP.sketchBox}
            style={{
              ...overlayButton,
              borderColor: boxOpen ? 'var(--gain)' : 'var(--border)',
            }}
          >
            Dimensions
          </button>
          <button
            type="button"
            onClick={() =>
              onExport(
                <SectionDrawing type={massing} terms={terms} reference={reference} selected={selected} />,
              )
            }
            disabled={exporting}
            style={overlayButton}
          >
            {exporting ? 'Exporting…' : 'PNG'}
          </button>
        </span>
      </div>

      {/* The drawing, and the dimensions drawer that opens to the left of it.
 
          The five fields used to sit in a row of their own below the table,
          which cost the panel 54 px it did not have to spend: the drawing is
          height-bound, so it was already rendering 125 px of empty margin at
          each side. Pushing the artwork to the right gathers both margins into
          one column on the left and the fields move into it — the drawing does
          not shrink, and the row is gone.

          They are now in that column only while the drawer is open. Shut, the
          column is not rendered at all and the artwork re-centres into the
          margin it came from, so the panel at rest is the drawing and the loss
          table and nothing else. */}
      <div className="env-stage" style={{ gap: boxOpen ? 10 : 0 }}>
        {/* paddingTop clears the floating title bar, which sits at top: 8 and
            ends around 28 — the panel title is directly above this column. */}
        {boxOpen && (
        <div id={boxDrawerId} className="env-drawer">
          {boxFields.map(({ key, caption, aria, decimals }) => (
            <div key={key} className="env-drawer-field">
              {/* nowrap: "Length, ft" breaks after the comma at any width that
                  fits the field beside it, and a two-line caption on three of
                  the five rows makes the column taller than the drawing. */}
              <span className="eyebrow" style={{ fontSize: 9.5, whiteSpace: 'nowrap' }}>
                {caption}
              </span>
              <NumberCell
                label={aria}
                value={showBox(key)}
                decimals={decimals}
                onCommit={(next) => takeBox(key, next)}
                style={{
                  width: 52,
                  textAlign: 'right',
                  padding: '2px 5px',
                  background: 'var(--page)',
                  border: '1px solid var(--border)',
                }}
              />
            </div>
          ))}
          {/* Under the five fields it acts on, and the full width of them, so
              it reads as the bottom of one control rather than a sixth field. */}
          <button
            type="button"
            onClick={applyBox}
            className="env-drawer-apply"
            style={{
              font: 'inherit',
              fontSize: 10.5,
              marginTop: 2,
              padding: '4px 6px',
              background: 'var(--gain)',
              color: 'var(--panel)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Create surfaces
          </button>
        </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <SectionDrawing
            type={massing}
            terms={terms}
            reference={reference}
            selected={selected}
            align={boxOpen && !compact ? 'right' : 'centre'}
            labelMode={compact ? 'markers' : 'text'}
            onSelect={(slot) => setSelected((current) => (current === slot ? null : slot))}
          />
        </div>
      </div>
    </>
  );

  const tablePart = (
    <>
      {/* The key the markers need. Every numbered arrow is in it, gains too:
          the cards below only cover the envelope's own rows, and a dot that is
          explained nowhere on screen is worse than the 4 px word it replaced. */}
      {numbers && numbers.size > 0 && (
        <ol className="env-key" aria-label="Key to the numbered arrows">
          {[...numbers].map(([slot, number]) => (
            <li key={slot}>
              <span className="env-badge" data-tone={LOSS_SLOTS.has(slot) ? 'loss' : 'gain'} aria-hidden="true">
                {number}
              </span>
              {terms.find((term) => term.slot === slot)?.label}
            </li>
          ))}
        </ol>
      )}

      <div style={{ padding: '2px 16px 12px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* A table on a desk and a stack of cards on a phone, from one DOM:
            `.env-table` is re-laid-out by a container query and each cell
            carries its column heading in `data-label` for the card to print.
            Five columns in 330 px was the choice between clipping the loss
            column and shrinking the type below reading size. */}
        <table className="env-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
                    padding: '3px 0',
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
                  className="env-row"
                  onClick={() => setSelected((current) => (current === slot ? null : slot))}
                  style={{
                    cursor: 'pointer',
                    background: isSelected ? 'var(--page)' : undefined,
                    opacity: empty ? 0.55 : 1,
                  }}
                >
                  <td className="env-name" style={{ padding: '2px 0', borderBottom: '1px solid var(--border)' }}>
                    {badge(slot)}
                    {surface.label}
                  </td>
                  <td className="env-field" data-label={`Area, ${labels.area}`} style={cell}>
                    <NumberCell
                      label={`${surface.label} area`}
                      value={units === 'IP' ? toSqFt(surface.area) : surface.area}
                      decimals={0}
                      onCommit={(next) =>
                        setSurface(surface.id, { area: Math.max(0, units === 'IP' ? fromSqFt(next) : next) })
                      }
                    />
                  </td>
                  <td className="env-field" data-label={`U, ${labels.uValue}`} style={cell}>
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
                  <td className="env-field" data-label={`R, ${labels.rValue}`} style={cell}>
                    <NumberCell
                      label={`${surface.label} R-value`}
                      value={surface.uValue > 0 ? uToR(surface.uValue, units) : 0}
                      decimals={1}
                      onCommit={(next) => next > 0 && setSurface(surface.id, { uValue: rToU(next, units) })}
                    />
                  </td>
                  {/* b, the temperature-difference factor, had a column here
                      for one revision and does not any more. The engine still
                      applies it and the 'buffer' boundary still works — what
                      was wrong was spending a column of a five-row table, and a
                      concept, on a case most users do not have. A wall to an
                      unheated garage is entered as an outdoor wall, which
                      overstates its loss in the conservative direction and is
                      disclosed in the assumptions. Exposing it is still a UI
                      change whenever it earns one. */}
                  <td className="env-loss" style={{ textAlign: 'right', padding: '2px 0', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', color: empty ? undefined : 'var(--loss)' }}>
                    {empty ? '—' : `${grouped(heatFlow(term?.watts ?? 0))} ${labels.heatFlow}`}
                  </td>
                </tr>
              );
            })}
            {/* The other air term, and usually the bigger one. Its controls are
                in the ventilation panel rather than here, because every one of
                them is a decision and there is no room; its LOSS is here,
                because this is where it has to compete with the surfaces. */}
            <tr className="env-row">
              <td className="env-name" style={{ padding: '2px 0', borderBottom: '1px solid var(--border)' }}>
                {badge('loss-ventilation')}
                Ventilation
              </td>
              <td colSpan={3} className="env-wide" style={{ ...cell, color: 'var(--muted)', fontSize: 11 }}>
                {ventilationNote}
              </td>
              <td className="env-loss" style={{ textAlign: 'right', padding: '2px 0', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', color: 'var(--loss)' }}>
                {grouped(heatFlow(ventilationWatts))} {labels.heatFlow}
              </td>
            </tr>
            {/* Not a surface either: no area, no U, no R. It earns a row
                because it is a loss like the five above it and frequently the
                largest of them, and a loss table that left out its biggest
                entry would be the wrong table. */}
            <tr className="env-row">
              <td className="env-name" style={{ padding: '2px 0', borderBottom: '1px solid var(--border)' }}>
                {badge('loss-infiltration')}
                Infiltration
              </td>
              <td colSpan={3} className="env-wide" style={{ ...cell, padding: '2px 0', borderBottom: '1px solid var(--border)' }}>
                <span role="group" aria-label="Air tightness" className="env-airtightness">
                  {/* Pick a grade if you do not know, type the number if you
                      do. Someone with a blower-door result or a specification
                      is the one user who actually knows the answer, and a
                      picker on its own would have nothing to offer them.

                      The badge follows the same contract as the gain presets:
                      typing over the number drops the grade, because a grade
                      that outlived the figure it described would be
                      attributing a user's number to ASHRAE. */}
                  {AIRTIGHTNESS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      title={`${g.note} (${g.cfm75} cfm/ft² at 75 Pa — ${g.citation})`}
                      aria-pressed={envelope.airtightness.grade === g.id}
                      onClick={() => onChange({ ...envelope, airtightness: leakageOf(g.id) })}
                      style={{
                        font: 'inherit',
                        fontSize: 10,
                        padding: '2px 7px',
                        background: 'var(--page)',
                        border: '1px solid',
                        borderColor: envelope.airtightness.grade === g.id ? 'var(--gain)' : 'var(--border)',
                        color: envelope.airtightness.grade === g.id ? 'var(--gain)' : 'var(--muted)',
                        cursor: 'pointer',
                      }}
                    >
                      {g.label}
                    </button>
                  ))}
                  <NumberCell
                    label="Air leakage at 75 Pa"
                    value={showLeakage(envelope.airtightness.leakage)}
                    decimals={2}
                    onCommit={(next) => {
                      const leakage = Math.max(0, takeLeakage(next));
                      onChange({
                        ...envelope,
                        airtightness: { leakage, grade: gradeMatching(leakage) },
                      });
                    }}
                    style={{ width: 58, textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{labels.leakage}</span>
                </span>
              </td>
              <td className="env-loss" style={{ textAlign: 'right', padding: '2px 0', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', color: 'var(--loss)' }}>
                {grouped(heatFlow(infiltrationWatts))} {labels.heatFlow}
              </td>
            </tr>
            {/* Not a surface: no U, no R, no loss. It earns its place in this
                table because it is the denominator under every per-area figure
                the tool reports, and it was previously settable only through
                the box helper. */}
            <tr className="env-row">
              <td className="env-name" style={{ padding: '2px 0', borderBottom: '1px solid var(--border)' }}>
                Gross floor area
              </td>
              <td className="env-field" data-label={`Area, ${labels.area}`} style={cell}>
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
              {/* The U and R columns are meaningless on this row and were two
                  em dashes. Wall-to-floor is a RATIO OF AREAS with gross floor
                  as its denominator, so the one row in the table that is not a
                  surface is exactly where it belongs — and it reads as a
                  property of the number beside it rather than of the panel. */}
              <td colSpan={2} className="env-ratio" style={{ ...cell, color: 'var(--muted)', fontSize: 11 }}>
                Wall-to-floor{' '}
                <span style={{ color: 'var(--ink)' }}>{wallToFloorRatio(envelope).toFixed(2)}</span>
              </td>
              <td className="env-loss" style={{ textAlign: 'right', padding: '2px 0', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
                drives the gains
              </td>
            </tr>
          </tbody>
        </table>

        {grossFloorTooSmall && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--loss)' }}>
            Gross floor area is below the {grouped(units === 'IP' ? toSqFt(floorOnGround) : floorOnGround)} {labels.area}{' '}
            of ground and exposed floor, which are part of it. The balance below still uses the figure entered.
          </p>
        )}

      </div>
    </>
  );

  const panelStyle: React.CSSProperties = {
    padding: 0,
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  };

  /*
   * Stacked, the panel comes apart around `between` — the 24-hour chart — so
   * the chart sits directly under the drawing it scrubs. On a desk the two sit
   * side by side and sliding along the chart visibly moves the arrows; stacked
   * with the table between them, the drawing was a screen away from the finger
   * doing the sliding, and the one interaction that makes this a single tool
   * was lost. The table and its key follow the chart.
   */
  if (between !== undefined) {
    return (
      <>
        <section ref={panelRef} className="panel env-panel cq" style={panelStyle}>
          {drawingPart}
        </section>
        {between}
        <section className="panel env-panel cq" style={{ ...panelStyle, paddingTop: 10 }}>
          {tablePart}
        </section>
      </>
    );
  }

  return (
    <section ref={panelRef} className="panel env-panel cq" style={panelStyle}>
      {drawingPart}
      {tablePart}
    </section>
  );
}
