// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EnvelopePanel } from '../src/ui/EnvelopePanel';
import { DEFAULT_ENVELOPE } from '../src/model/defaults';
import {
  SAMPLE_CONDITIONS,
  SAMPLE_DESIGN_DAY,
  SAMPLE_GAINS,
} from '../src/model/sampleProject';
import { DEFAULT_VENTILATION } from '../src/model/ventilation';

/**
 * The five sketch-box dimensions are a ONE-TIME entry behind a drawer.
 *
 * They fill the surface table in and are then never read again, but they used
 * to hold a column of the panel for the whole of the rest of the session,
 * beside the drawing and the loss table the tool exists to show. The drawer
 * opens in the same column they occupied, so nothing else moves.
 *
 * Three things are worth pinning, and each of them is a way the drawer could
 * quietly stop being one: it must be SHUT on load, it must not swallow the
 * fields' accessible names while it is open, and "Create surfaces" must close
 * it — the one action it exists for is also the way out of it.
 */
afterEach(cleanup);

const FIELDS = [
  'Box length, ft',
  'Box width, ft',
  'Box height, ft',
  'Box storeys',
  'Box WWR, window-to-wall ratio',
];

const panel = (onChange = vi.fn()) => {
  render(
    <EnvelopePanel
      envelope={DEFAULT_ENVELOPE}
      gains={SAMPLE_GAINS}
      ventilation={DEFAULT_VENTILATION}
      conditions={SAMPLE_CONDITIONS}
      designDay={SAMPLE_DESIGN_DAY}
      units="IP"
      scrubHour={null}
      onChange={onChange}
      onExport={vi.fn()}
      exporting={false}
    />,
  );
  return { handle: () => screen.getByText('Dimensions'), onChange };
};

describe('the dimensions drawer', () => {
  it('is shut on load, with none of the five fields rendered', () => {
    panel();
    for (const field of FIELDS) {
      expect(screen.queryByLabelText(field), field).toBeNull();
    }
    expect(screen.queryByText('Create surfaces')).toBeNull();
  });

  it('opens on the handle and puts all five fields on screen', () => {
    const { handle } = panel();
    expect(handle().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(handle());
    expect(handle().getAttribute('aria-expanded')).toBe('true');
    for (const field of FIELDS) {
      expect(screen.getByLabelText(field), field).toBeTruthy();
    }
  });

  it('shuts again on the same handle', () => {
    const { handle } = panel();
    fireEvent.click(handle());
    fireEvent.click(handle());
    expect(handle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Box length, ft')).toBeNull();
  });

  it('names the region it controls, so the handle is not a button pointing at nothing', () => {
    const { handle } = panel();
    fireEvent.click(handle());
    const controls = handle().getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)).toBeTruthy();
  });

  /**
   * The point of the whole change. Applying the box writes five areas into the
   * table, and the table is where they are edited from then on — so the drawer
   * has no further job and leaving it open would put the form back in front of
   * the results the user just changed.
   */
  it('closes when the surfaces are created, and still applies them', () => {
    const { handle, onChange } = panel();
    fireEvent.click(handle());
    fireEvent.click(screen.getByText('Create surfaces'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(handle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Box length, ft')).toBeNull();
  });

  /**
   * The drawing is the thing the drawer must not disturb. It sits right of the
   * fields while they are open and re-centres into that margin when they go,
   * which is why the column can be removed from the DOM rather than hidden.
   */
  it('re-centres the drawing when shut and pushes it right when open', () => {
    const { handle } = panel();
    const preserve = () =>
      document.querySelector('svg[preserveAspectRatio]')?.getAttribute('preserveAspectRatio');
    expect(preserve()).toBe('xMidYMid meet');
    fireEvent.click(handle());
    expect(preserve()).toBe('xMaxYMid meet');
  });
});
