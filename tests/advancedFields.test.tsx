// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EnvelopePanel } from '../src/ui/EnvelopePanel';
import { solve } from '../src/engine/balance';
import { surfaceConductance } from '../src/engine/ua';
import { DEFAULT_CONDITIONS, DEFAULT_ENVELOPE, DEFAULT_GAINS } from '../src/model/defaults';
import { SAMPLE_CONDITIONS, SAMPLE_DESIGN_DAY, SAMPLE_GAINS } from '../src/model/sampleProject';

/**
 * The three fields v1 held at their defaults and showed no control for.
 *
 * The rule that hid them was: hide a value the tool can always default
 * correctly. Two of them stopped qualifying. φ became absurd at 400 kW and is
 * gone entirely, replaced by a cooling medium. The flat design day was always
 * defaulted correctly — a real diurnal profile IS the honest screen — but the
 * one person who needs the other answer is the one cross-checking against a
 * load calculation, and silence left them with two numbers and no explanation.
 * `b` was pinned at 1, which made the 'buffer' boundary unreachable.
 */
afterEach(cleanup);

describe('the flat design day', () => {
  const run = (flat: boolean) =>
    solve({
      envelope: DEFAULT_ENVELOPE,
      gains: DEFAULT_GAINS,
      conditions: { ...DEFAULT_CONDITIONS, flatDesignDay: flat },
      designDay: SAMPLE_DESIGN_DAY,
    });

  it('is off by default, because the diurnal profile is the honest screen', () => {
    expect(DEFAULT_CONDITIONS.flatDesignDay).toBe(false);
  });

  it('holds every hour at the minimum when on', () => {
    const temps = run(true).hours.map((h) => h.outdoorTemperature);
    expect(new Set(temps).size).toBe(1);
    expect(temps[0]).toBeCloseTo(SAMPLE_DESIGN_DAY.minimum, 9);
  });

  it('leaves the derived design day alone — it transforms, it does not overwrite', () => {
    const before = SAMPLE_DESIGN_DAY.hours.map((h) => h.tdb);
    run(true);
    expect(SAMPLE_DESIGN_DAY.hours.map((h) => h.tdb)).toEqual(before);
  });

  it('gives a worse answer, which is the whole point of offering it', () => {
    // A flat day sits at the minimum all day, so it throws away the daytime
    // warmth a real cold day has. Anyone comparing against a load calculation
    // needs to see that the comparison costs them something.
    expect(run(true).peakHeatingLoad).toBeGreaterThan(run(false).peakHeatingLoad);
  });

  it('moves the worst hour to the lowest-gain hour', () => {
    // With loss constant, nothing but the gain schedule can decide it.
    const flat = run(true);
    const lowestGain = flat.hours.reduce((a, h) => (h.gain < a.gain ? h : a), flat.hours[0]!);
    expect(flat.worstHour).toBe(lowestGain.hour);
  });

  it('survives a share link', async () => {
    const { decodeState, encodeState } = await import('../src/io/share');
    const state = {
      units: 'IP' as const,
      site: (await import('../src/model/sampleProject')).SAMPLE_SITE,
      designDay: SAMPLE_DESIGN_DAY,
      conditions: { ...SAMPLE_CONDITIONS, flatDesignDay: true },
      envelope: DEFAULT_ENVELOPE,
      gains: SAMPLE_GAINS,
    };
    expect(decodeState(encodeState(state))!.conditions.flatDesignDay).toBe(true);
  });
});

describe('the buffer factor b', () => {
  it('scales a surface conductance, and always did', () => {
    // The engine has applied b since phase 01 so that exposing it would be a UI
    // change and not a model change. This is that promise being collected.
    const wall = DEFAULT_ENVELOPE.surfaces.find((s) => s.category === 'wall')!;
    expect(surfaceConductance({ ...wall, bufferFactor: 0.5, boundary: 'buffer' }))
      .toBeCloseTo(surfaceConductance({ ...wall, bufferFactor: 1 }) / 2, 9);
  });

  it('is ignored on a ground-coupled surface, which has its own driver', () => {
    const floor = DEFAULT_ENVELOPE.surfaces.find((s) => s.boundary === 'ground')!;
    expect(surfaceConductance({ ...floor, bufferFactor: 0.2 }))
      .toBeCloseTo(surfaceConductance({ ...floor, bufferFactor: 1 }), 9);
  });

  const panel = (onChange = vi.fn()) => {
    render(
      <EnvelopePanel
        envelope={DEFAULT_ENVELOPE}
        gains={SAMPLE_GAINS}
        conditions={SAMPLE_CONDITIONS}
        designDay={SAMPLE_DESIGN_DAY}
        units="SI"
        scrubHour={null}
        onChange={onChange}
        onExport={vi.fn()}
        exporting={false}
      />,
    );
    return onChange;
  };

  it('has a column, and it starts at 1', () => {
    panel();
    expect((screen.getByLabelText('Walls b factor') as HTMLInputElement).value).toBe('1.00');
  });

  it('shows no control on the ground floor', () => {
    panel();
    expect(screen.queryByLabelText('Ground floor b factor')).toBeNull();
  });

  it('turns the surface into a buffer boundary when b drops below 1', () => {
    // One control, not two. A separate boundary picker could disagree with the
    // number beside it, and then the tool has two answers to one question.
    const onChange = panel();
    fireEvent.change(screen.getByLabelText('Walls b factor'), { target: { value: '0.5' } });
    fireEvent.blur(screen.getByLabelText('Walls b factor'));

    const wall = onChange.mock.calls.at(-1)![0].surfaces.find((s: { category: string }) => s.category === 'wall');
    expect(wall.bufferFactor).toBe(0.5);
    expect(wall.boundary).toBe('buffer');
  });

  it('goes back to outdoor air at b = 1', () => {
    const onChange = panel();
    const field = screen.getByLabelText('Roof b factor');
    fireEvent.change(field, { target: { value: '1' } });
    fireEvent.blur(field);
    const roof = onChange.mock.calls.at(-1)![0].surfaces.find((s: { category: string }) => s.category === 'roof');
    expect(roof.boundary).toBe('air');
  });

  it('clamps to 0–1 rather than taking a typo into the balance', () => {
    const onChange = panel();
    const field = screen.getByLabelText('Windows b factor');
    fireEvent.change(field, { target: { value: '7' } });
    fireEvent.blur(field);
    const windows = onChange.mock.calls.at(-1)![0].surfaces.find((s: { category: string }) => s.category === 'window');
    expect(windows.bufferFactor).toBe(1);
  });
});
