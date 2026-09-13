// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EnvelopePanel } from '../src/ui/EnvelopePanel';
import { areasFromBox, DEFAULT_BOX } from '../src/engine/sketchBox';
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
