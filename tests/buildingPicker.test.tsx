// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GainsPanel } from '../src/ui/GainsPanel';
import { ScopePanel } from '../src/ui/ScopePanel';
import { DEFAULT_GAINS } from '../src/model/defaults';
import { DEFAULT_VENTILATION } from '../src/model/ventilation';
import { applyGainPreset, setDensity } from '../src/model/editGains';
import { GAIN_PRESETS, presetById } from '../src/model/gainPresets';
import type { Gains } from '../src/model/types';
import { SAMPLE_GAINS } from '../src/model/sampleProject';

/**
 * The picker must never name a building type the numbers are not.
 *
 * A `<select>` whose value matches no option does not render blank — the
 * browser falls back to the FIRST option. That put "Assembly" on screen while
 * the page showed the office worked example, and nothing about the display
 * looked broken.
 */
afterEach(cleanup);

const vent = { ventilation: DEFAULT_VENTILATION, onVentilationChange: vi.fn() };

const panel = (gains: Gains, onChange = vi.fn()) => {
  render(<GainsPanel gains={gains} floorArea={500} units="IP" marker={6} onChange={onChange} {...vent} />);
  return { select: screen.getByLabelText('Building type') as HTMLSelectElement, onChange };
};

describe('the building-type picker', () => {
  it('offers every type in the sheet', () => {
    const { select } = panel(DEFAULT_GAINS);
    const values = [...select.options].map((o) => o.value).filter(Boolean);
    expect(values).toEqual(GAIN_PRESETS.map((p) => p.id));
  });

  it('shows the type whose numbers are loaded', () => {
    const { select } = panel(applyGainPreset(DEFAULT_GAINS, presetById('warehouse')!));
    expect(select.value).toBe('warehouse');
  });

  it('does NOT fall through to the first option when the preset is unrecognised', () => {
    // The worked example's preset is "Office (provisional)" — real densities,
    // but not one of the sheet's rows. Before the fix this rendered "Assembly".
    const { select } = panel(SAMPLE_GAINS);
    expect(select.value).toBe('');
    expect(select.value).not.toBe(GAIN_PRESETS[0]!.id);
    expect(select.selectedOptions[0]!.text).toContain('not a listed type');
  });

  it('KEEPS the building type when a value is edited', () => {
    // Editing a density does not change what building this is. Reading the
    // selection off the badge meant the first edit snapped the picker — and the
    // section drawing with it — back to the office.
    const edited = setDensity(applyGainPreset(DEFAULT_GAINS, presetById('warehouse')!), 'lighting', 9);
    expect(edited.preset).toBeNull();
    expect(edited.sourceId).toBe('warehouse');
    const { select } = panel(edited);
    expect(select.value).toBe('warehouse');
  });

  it('says the numbers are edited without losing the name', () => {
    const edited = setDensity(applyGainPreset(DEFAULT_GAINS, presetById('warehouse')!), 'lighting', 9);
    const { container } = render(
      <GainsPanel gains={edited} floorArea={500} units="IP" marker={6} onChange={vi.fn()} {...vent} />,
    );
    expect(container.textContent).toContain('Warehouse — edited');
  });

  it('offers a way back, because re-picking the same option fires nothing', () => {
    const warehouse = presetById('warehouse')!;
    const edited = setDensity(applyGainPreset(DEFAULT_GAINS, warehouse), 'lighting', 9);
    const onChange = vi.fn();
    render(<GainsPanel gains={edited} floorArea={500} units="IP" marker={6} onChange={onChange} {...vent} />);

    fireEvent.click(screen.getByText(/Reset to Warehouse/));
    const back = onChange.mock.calls.at(-1)![0] as Gains;
    expect(back.preset).toBe('Warehouse');
    expect(back.lighting.powerDensity).toBeCloseTo(warehouse.lighting.value!, 9);
  });

  it('still refuses to fall through when there is no source at all', () => {
    const { select } = panel({ ...DEFAULT_GAINS, preset: null, sourceId: null });
    expect(select.value).toBe('');
    expect(select.selectedOptions[0]!.text).toContain('Edited');
  });

  it('applies the chosen type to every density', () => {
    const { select, onChange } = panel(DEFAULT_GAINS);
    fireEvent.change(select, { target: { value: 'restaurant-full' } });

    const next = onChange.mock.calls.at(-1)![0] as Gains;
    const restaurant = presetById('restaurant-full')!;
    expect(next.preset).toBe('Full Service Restaurant');
    expect(next.lighting.powerDensity).toBeCloseTo(restaurant.lighting.value!, 9);
    expect(next.occupancy.areaPerPerson).toBeCloseTo(restaurant.areaPerPerson.value!, 9);
  });

  it('does not spend panel space on where the numbers came from', () => {
    const { container } = render(
      <GainsPanel gains={DEFAULT_GAINS} floorArea={500} units="IP" marker={6} onChange={vi.fn()} {...vent} />,
    );
    expect(container.textContent).not.toContain('Building Area Method');
  });

  it('still names the provenance, in the assumptions panel', () => {
    const { container } = render(<ScopePanel />);
    fireEvent.click(screen.getByText(/All \d+ assumptions/));
    expect(container.textContent).toContain('PNNL prototype');
    expect(container.textContent).toContain('Building Area Method');
  });

  it('swaps the schedules as well as the densities', () => {
    const { select, onChange } = panel(DEFAULT_GAINS);
    fireEvent.change(select, { target: { value: 'apartment-midrise' } });
    const next = onChange.mock.calls.at(-1)![0] as Gains;
    // An office is empty at 05:00; an apartment is not. If the picker moved
    // only densities, this would still read zero.
    expect(DEFAULT_GAINS.schedules.occupancy.fractions[5]).toBe(0);
    expect(next.schedules.occupancy.fractions[5]!).toBeGreaterThan(0.9);
  });
});
