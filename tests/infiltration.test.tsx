// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EnvelopePanel } from '../src/ui/EnvelopePanel';
import { infiltrationConductance } from '../src/engine/ua';
import {
  AIRTIGHTNESS,
  DESIGN_PRESSURE_FACTOR,
  gradeMatching,
  leakageOf,
  M3S_M2_PER_CFM_FT2,
  airHeatCapacity,
} from '../src/model/airtightness';
import { DEFAULT_CONDITIONS, DEFAULT_ENVELOPE } from '../src/model/defaults';
import { SAMPLE_DESIGN_DAY, SAMPLE_GAINS, SAMPLE_CONDITIONS } from '../src/model/sampleProject';
import type { Envelope, UnitSystem } from '../src/model/types';

afterEach(cleanup);

/**
 * The area the leakage rate is applied to.
 *
 * cfm/ft² at 75 Pa is defined per unit of ENVELOPE, so getting the area basis
 * wrong is a silent multiplier on the largest loss term in the table. Ground
 * floors are out: a slab has no outdoor air on the other side to leak to.
 */
describe('infiltration is applied to the above-grade envelope', () => {
  const area = (envelope: Envelope) =>
    envelope.surfaces
      .filter((s) => s.boundary !== 'ground')
      .reduce((t, s) => t + s.area, 0);

  it('counts walls, windows and roof, and excludes the ground floor', () => {
    const counted = DEFAULT_ENVELOPE.surfaces.filter((s) => s.boundary !== 'ground');
    expect(counted.map((s) => s.category).sort())
      .toEqual(['exposedFloor', 'roof', 'wall', 'window']);
    expect(counted.some((s) => s.category === 'groundFloor')).toBe(false);
  });

  it('matches the arithmetic done by hand', () => {
    const flow =
      DEFAULT_ENVELOPE.airtightness.leakage * DESIGN_PRESSURE_FACTOR * area(DEFAULT_ENVELOPE);
    expect(infiltrationConductance(DEFAULT_ENVELOPE, DEFAULT_CONDITIONS))
      .toBeCloseTo(flow * airHeatCapacity(DEFAULT_CONDITIONS.siteElevation), 9);
  });

  it('scales with the envelope and not with the floor', () => {
    // Doubling the roof doubles the leaking area; doubling the gross floor,
    // which is a denominator and not a surface, changes nothing.
    const base = infiltrationConductance(DEFAULT_ENVELOPE, DEFAULT_CONDITIONS);
    const biggerFloorArea = { ...DEFAULT_ENVELOPE, floorArea: DEFAULT_ENVELOPE.floorArea * 2 };
    expect(infiltrationConductance(biggerFloorArea, DEFAULT_CONDITIONS)).toBeCloseTo(base, 9);

    const roof = DEFAULT_ENVELOPE.surfaces.find((s) => s.category === 'roof')!;
    const biggerRoof = {
      ...DEFAULT_ENVELOPE,
      surfaces: DEFAULT_ENVELOPE.surfaces.map((s) =>
        s.id === roof.id ? { ...s, area: s.area + 1000 } : s,
      ),
    };
    expect(infiltrationConductance(biggerRoof, DEFAULT_CONDITIONS)).toBeGreaterThan(base);
  });

  it('thins the air with altitude', () => {
    const denver = { ...DEFAULT_CONDITIONS, siteElevation: 1600 };
    const ratio =
      infiltrationConductance(DEFAULT_ENVELOPE, denver) /
      infiltrationConductance(DEFAULT_ENVELOPE, DEFAULT_CONDITIONS);
    expect(ratio).toBeLessThan(1);
    expect(ratio).toBeCloseTo(0.824, 3);
  });
});

describe('the grades', () => {
  it('ship typical as the default, which is the code requirement', () => {
    expect(DEFAULT_ENVELOPE.airtightness.grade).toBe('typical');
    expect(DEFAULT_ENVELOPE.airtightness.leakage).toBeCloseTo(0.4 * M3S_M2_PER_CFM_FT2, 12);
  });

  it('spans more than twenty to one, leaky to tight', () => {
    const [leaky, , tight] = AIRTIGHTNESS;
    expect(leaky!.cfm75 / tight!.cfm75).toBeGreaterThan(20);
  });

  it('cites a document for every one of them', () => {
    for (const g of AIRTIGHTNESS) {
      expect(g.citation, g.id).toMatch(/ASHRAE|IECC|Passive House|PNNL/);
    }
  });
});

/**
 * A picker alone would be useless to the one user who actually knows.
 *
 * Someone with a blower-door result or a specification has the real number.
 * The badge follows the gain-preset contract: typing over the figure drops the
 * grade, because a grade outliving the number it described would attribute a
 * user's figure to ASHRAE.
 */
describe('the leakage rate can be entered by hand', () => {
  const panel = (units: UnitSystem = 'IP', onChange = vi.fn()) => {
    render(
      <EnvelopePanel
        envelope={DEFAULT_ENVELOPE}
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
    return onChange;
  };

  it('opens on typical, showing 0.40 cfm/ft² under IP', () => {
    panel();
    expect((screen.getByLabelText('Air leakage at 75 Pa') as HTMLInputElement).value).toBe('0.40');
  });

  it('shows the SI convention under SI, which is a different number', () => {
    panel('SI');
    // 0.40 cfm/ft² is 7.32 m³/h·m² — the same rate, the other unit.
    expect((screen.getByLabelText('Air leakage at 75 Pa') as HTMLInputElement).value).toBe('7.32');
  });

  it('takes a typed rate and drops the grade badge', () => {
    const onChange = panel();
    const field = screen.getByLabelText('Air leakage at 75 Pa');
    fireEvent.change(field, { target: { value: '0.63' } });
    fireEvent.blur(field);

    const next = onChange.mock.calls.at(-1)![0] as Envelope;
    expect(next.airtightness.leakage).toBeCloseTo(0.63 * M3S_M2_PER_CFM_FT2, 12);
    expect(next.airtightness.grade).toBeNull();
  });

  it('badges a typed rate that lands on a published one', () => {
    // It IS that grade's value, however it was arrived at.
    const onChange = panel();
    const field = screen.getByLabelText('Air leakage at 75 Pa');
    fireEvent.change(field, { target: { value: '1.8' } });
    fireEvent.blur(field);
    expect((onChange.mock.calls.at(-1)![0] as Envelope).airtightness.grade).toBe('leaky');
  });

  it('refuses a negative rate rather than inventing a heat source', () => {
    const onChange = panel();
    const field = screen.getByLabelText('Air leakage at 75 Pa');
    fireEvent.change(field, { target: { value: '-2' } });
    fireEvent.blur(field);
    expect((onChange.mock.calls.at(-1)![0] as Envelope).airtightness.leakage).toBe(0);
  });

  it('still lets a grade be picked, which restores the badge', () => {
    const onChange = panel();
    fireEvent.click(screen.getByText('Tight'));
    const next = onChange.mock.calls.at(-1)![0] as Envelope;
    expect(next.airtightness).toEqual(leakageOf('tight'));
    expect(gradeMatching(next.airtightness.leakage)).toBe('tight');
  });
});
