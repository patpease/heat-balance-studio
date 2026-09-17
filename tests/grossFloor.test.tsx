// @vitest-environment jsdom
import { DEFAULT_VENTILATION } from '../src/model/ventilation';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EnvelopePanel } from '../src/ui/EnvelopePanel';
import { areasFromBox, DEFAULT_BOX } from '../src/engine/sketchBox';
import { wallToFloorRatio } from '../src/engine/ua';
import { DEFAULT_ENVELOPE } from '../src/model/defaults';
import type { Envelope, UnitSystem } from '../src/model/types';
import {
  SAMPLE_CONDITIONS,
  SAMPLE_DESIGN_DAY,
  SAMPLE_GAINS,
} from '../src/model/sampleProject';
import { toSqFt } from '../src/model/units';
import { grouped } from '../src/ui/format';

/**
 * Gross floor area is the denominator under every per-area figure the tool
 * reports, and until now it was settable only through the box helper.
 *
 * The rule it has to hold: it can never be LESS than the floors sitting on the
 * ground or over air, because those are part of it. Equal is the ordinary
 * single-storey case, so only "less than" is wrong.
 */
afterEach(cleanup);

const panel = (envelope: Envelope, units: UnitSystem = 'SI', onChange = vi.fn()) => {
  const view = render(
    <EnvelopePanel
      envelope={envelope}
      gains={SAMPLE_GAINS}
      ventilation={DEFAULT_VENTILATION}
      conditions={SAMPLE_CONDITIONS}
      designDay={SAMPLE_DESIGN_DAY}
      units={units}
      scrubHour={null}
      onChange={onChange}
      onExport={vi.fn()}
      exporting={false}
    />,
  );
  return { ...view, onChange };
};

const floorsOnGround = (envelope: Envelope) =>
  envelope.surfaces
    .filter((s) => s.category === 'groundFloor' || s.category === 'exposedFloor')
    .reduce((t, s) => t + s.area, 0);

describe('the gross floor area row', () => {
  it('is on the page and carries the envelope value', () => {
    panel(DEFAULT_ENVELOPE);
    const field = screen.getByLabelText('Gross floor area') as HTMLInputElement;
    // Grouped, not raw: 6,000 rather than 6000. See ui/format.ts.
    expect(field.value).toBe(grouped(DEFAULT_ENVELOPE.floorArea));
  });

  it('converts with the unit switch like every other area', () => {
    panel(DEFAULT_ENVELOPE, 'IP');
    const field = screen.getByLabelText('Gross floor area') as HTMLInputElement;
    expect(field.value).toBe(grouped(toSqFt(DEFAULT_ENVELOPE.floorArea)));
  });

  it('edits the envelope rather than the surfaces', () => {
    const { onChange } = panel(DEFAULT_ENVELOPE);
    const field = screen.getByLabelText('Gross floor area');
    fireEvent.change(field, { target: { value: '7500' } });
    fireEvent.blur(field);

    const next = onChange.mock.calls.at(-1)![0] as Envelope;
    expect(next.floorArea).toBe(7500);
    expect(next.surfaces).toEqual(DEFAULT_ENVELOPE.surfaces);
  });
});

describe('the floor it stands on is part of it', () => {
  it('says nothing when the figure is sound', () => {
    const { container } = panel(DEFAULT_ENVELOPE);
    expect(container.textContent).not.toMatch(/is below the/);
  });

  it('accepts EQUAL, which is the ordinary single-storey case', () => {
    // One footprint, one floor. Flagging this would flag most small buildings.
    const single: Envelope = { ...DEFAULT_ENVELOPE, floorArea: floorsOnGround(DEFAULT_ENVELOPE) };
    const { container } = panel(single);
    expect(container.textContent).not.toMatch(/is below the/);
  });

  it('flags a figure below the ground and exposed floor', () => {
    const tooSmall: Envelope = { ...DEFAULT_ENVELOPE, floorArea: floorsOnGround(DEFAULT_ENVELOPE) - 1 };
    const { container } = panel(tooSmall);
    expect(container.textContent).toMatch(/is below the/);
  });

  it('keeps calculating rather than clamping or blanking', () => {
    // The number stays as typed and still reaches the balance: clamping would
    // overwrite the entry, and hiding the verdict would hide the consequence
    // that reveals the mistake.
    const tooSmall: Envelope = { ...DEFAULT_ENVELOPE, floorArea: 10 };
    const { container, onChange } = panel(tooSmall);
    expect((screen.getByLabelText('Gross floor area') as HTMLInputElement).value).toBe('10');
    expect(container.textContent).toMatch(/still uses the figure entered/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('counts an exposed floor towards the minimum, not just the ground floor', () => {
    const withExposed: Envelope = {
      ...DEFAULT_ENVELOPE,
      surfaces: DEFAULT_ENVELOPE.surfaces.map((s) =>
        s.category === 'exposedFloor' ? { ...s, area: 400 } : s,
      ),
      floorArea: floorsOnGround(DEFAULT_ENVELOPE) + 200,
    };
    const { container } = panel(withExposed);
    expect(container.textContent).toMatch(/is below the/);
  });
});

describe('Create surfaces', () => {
  it('always produces a gross floor area that satisfies the rule', () => {
    for (const storeys of [1, 2, 4, 12]) {
      const areas = areasFromBox({ ...DEFAULT_BOX, storeys });
      expect(areas.floorArea, `${storeys} storeys`)
        .toBeGreaterThanOrEqual(areas.groundFloorArea + areas.exposedFloorArea);
    }
  });

  it('is named for what it does', () => {
    panel(DEFAULT_ENVELOPE);
    expect(screen.getByText('Create surfaces')).toBeTruthy();
  });
});

/**
 * Where the wall-to-floor ratio lives.
 *
 * It has moved twice, and both moves were forced by a container that could not
 * hold it. It sat beside the box helper, where it was the third thing on a row
 * with space for two. It then sat in the panel's title bar, where title, ratio
 * and export button came to 624 px in a 620 px bar and the button dropped to a
 * second line.
 *
 * The gross floor area row is where it belongs on the merits rather than on the
 * pixels: wall-to-floor is a ratio of areas whose denominator is gross floor,
 * and that row had two meaningless em dashes under the U and R columns doing
 * nothing. These tests pin the placement so the title bar cannot quietly
 * reacquire a third item.
 */
describe('the wall-to-floor ratio sits on the gross floor area row', () => {
  const grossRow = () =>
    Array.from(document.querySelectorAll('tbody tr')).find((row) =>
      /Gross floor area/.test(row.textContent ?? ''),
    )!;

  it('renders on that row, exactly once in the panel', () => {
    const { container } = panel(DEFAULT_ENVELOPE);
    expect(grossRow().textContent).toMatch(/Wall-to-floor/);
    expect((container.textContent ?? '').match(/Wall-to-floor/g)).toHaveLength(1);
  });

  it('shows the ratio to two places', () => {
    panel(DEFAULT_ENVELOPE);
    expect(grossRow().textContent).toMatch(
      new RegExp('Wall-to-floor\\s*' + wallToFloorRatio(DEFAULT_ENVELOPE).toFixed(2)),
    );
  });

  it('takes the columns that have no meaning on this row', () => {
    // U, R and b do not apply to a floor area. They were em dashes.
    panel(DEFAULT_ENVELOPE);
    const spanned = Array.from(grossRow().querySelectorAll('td')).find((cell) => cell.colSpan > 1);
    expect(spanned).toBeDefined();
    expect(spanned!.textContent).toMatch(/Wall-to-floor/);
    expect(grossRow().textContent).not.toMatch(/—/);
  });

  it('still spans the full width of the table', () => {
    // The invariant a colSpan exists to hold, and the one that breaks silently
    // the next time a column is added: this row must cover exactly as many
    // columns as the header declares, or every cell below shifts left.
    panel(DEFAULT_ENVELOPE);
    const headers = document.querySelectorAll('thead th').length;
    const spanned = Array.from(grossRow().querySelectorAll('td'))
      .reduce((total, cell) => total + cell.colSpan, 0);
    expect(spanned).toBe(headers);
  });

  it('holds every surface row to the same width too', () => {
    panel(DEFAULT_ENVELOPE);
    const headers = document.querySelectorAll('thead th').length;
    for (const row of document.querySelectorAll('tbody tr')) {
      const width = Array.from(row.querySelectorAll('td'))
        .reduce((total, cell) => total + cell.colSpan, 0);
      expect(width, row.firstElementChild?.textContent ?? '').toBe(headers);
    }
  });

  it('keeps the panel title bar to two items', () => {
    // Title and export button. A third pushed the button onto its own line.
    panel(DEFAULT_ENVELOPE);
    const heading = screen.getByRole('heading', { level: 2 });
    const bar = heading.parentElement!;
    expect(bar.children).toHaveLength(2);
    expect(bar.textContent).not.toMatch(/Wall-to-floor/);
  });

  it('names the worst hour, without the article', () => {
    // Trimmed to make room for the ratio, then kept once the room came back.
    // Asserted so the two halves of the title cannot drift apart again.
    panel(DEFAULT_ENVELOPE);
    const title = screen.getByRole('heading', { level: 2 }).textContent ?? '';
    expect(title).toMatch(/, worst hour$/);
    expect(title).not.toMatch(/the worst hour/);
  });
});
