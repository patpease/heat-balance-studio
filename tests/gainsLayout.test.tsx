// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GainsPanel } from '../src/ui/GainsPanel';
import { DEFAULT_GAINS } from '../src/model/defaults';
import { DEFAULT_VENTILATION } from '../src/model/ventilation';
import type { Ventilation } from '../src/model/ventilation';

/**
 * The gains box after ventilation moved into it.
 *
 * Two things are being pinned here, and both of them are the kind that break
 * without anyone noticing: the schedule strips all starting in the same place,
 * and the prose staying out of the box it was taken out of.
 */
afterEach(cleanup);

const draw = (ventilation: Ventilation = DEFAULT_VENTILATION, onVentilationChange = vi.fn()) => {
  const view = render(
    <GainsPanel
      gains={DEFAULT_GAINS}
      floorArea={500}
      units="IP"
      marker={6}
      onChange={vi.fn()}
      ventilation={ventilation}
      onVentilationChange={onVentilationChange}
    />,
  );
  return { ...view, onVentilationChange };
};

const strips = (container: HTMLElement) =>
  [...container.querySelectorAll('svg[aria-label$="schedule, 24 hours"]')];

describe('the schedule strips', () => {
  /**
   * The bug this replaces: the input column was a `minWidth`, and the people
   * row carried a derived "= 323 people" the other rows did not. Its strip
   * therefore started 61 px right of the other three, and four schedules meant
   * to be read as one picture began in two different places.
   */
  it('all start at the same place, because the column before them is fixed', () => {
    const { container } = draw();
    const widths = strips(container).map(
      (strip) => (strip.previousElementSibling as HTMLElement).style.width,
    );

    expect(widths).toHaveLength(5);
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toMatch(/^\d+px$/);
  });

  it('puts ventilation between the people row and the lighting row', () => {
    const { container } = draw();
    expect(strips(container).map((s) => s.getAttribute('aria-label'))).toEqual([
      'People schedule, 24 hours',
      'Ventilation schedule, 24 hours',
      'Lighting schedule, 24 hours',
      'Misc equipment schedule, 24 hours',
      'IT equipment schedule, 24 hours',
    ]);
  });
});

describe('the ventilation row', () => {
  it('is in the gains panel, not a panel of its own', () => {
    const { container } = draw();
    const section = container.querySelector('section')!;
    expect(section.textContent).toContain('Internal gains and ventilation');
    expect(section.querySelector('svg[aria-label^="Ventilation"]')).not.toBeNull();
  });

  it('reports the fan rather than accepting 24 numbers for it', () => {
    const { container } = draw();
    const strip = container.querySelector('svg[aria-label^="Ventilation"]')!;
    expect(strip.getAttribute('tabindex')).toBe('-1');
  });

  /** A loss drawn in the gain colour would be the one real risk of this move. */
  it('draws the fan in the loss colour', () => {
    const { container } = draw();
    const bar = container
      .querySelector('svg[aria-label^="Ventilation"]')!
      .querySelector('g rect') as SVGRectElement;
    expect(bar.getAttribute('fill')).toBe('var(--loss)');
  });

  it('hands the fan schedule back through its own callback', () => {
    const { onVentilationChange } = draw();
    fireEvent.click(screen.getByText('With occupancy'));
    expect(onVentilationChange.mock.calls.at(-1)![0]).toMatchObject({ schedule: 'occupancy' });
  });

  it('keeps its explanation behind the row toggle rather than on the page', () => {
    const { container } = draw();
    expect(container.textContent).not.toContain('ASHRAE 62.1 sizes outdoor air');

    fireEvent.click(screen.getByRole('button', { name: /^Ventilation/ }));
    expect(container.textContent).toContain('ASHRAE 62.1 sizes outdoor air');
  });
});
