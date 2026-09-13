// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EnvelopePanel } from '../src/ui/EnvelopePanel';
import { LocationPanel } from '../src/ui/LocationPanel';
import { DEFAULT_BOX } from '../src/engine/sketchBox';
import { GROUND_DRIFT_LIMIT_K } from '../src/model/defaults';
import type { UnitSystem } from '../src/model/types';
import {
  SAMPLE_CONDITIONS,
  SAMPLE_DESIGN_DAY,
  SAMPLE_ENVELOPE,
  SAMPLE_GAINS,
  SAMPLE_SITE,
} from '../src/model/sampleProject';
import type { Envelope } from '../src/model/types';
import { deltaToF, LABELS, toF, toFt, toSqFt } from '../src/model/units';

/**
 * The IP/SI switch has to reach EVERY number on the page.
 *
 * A panel that misses the switch is the worst kind of unit bug: the figure is
 * still plausible, still has a unit printed next to it, and is simply the other
 * system's number. Two panels were missing it — the location strip, which never
 * received `units` at all, and the sketch-box fields, which were unlabelled
 * metres shown to a user reading feet.
 */
afterEach(cleanup);

const location = (units: UnitSystem) =>
  render(
    <LocationPanel
      site={SAMPLE_SITE}
      designDay={SAMPLE_DESIGN_DAY}
      conditions={SAMPLE_CONDITIONS}
      units={units}
      onApply={vi.fn()}
    />,
  ).container.textContent ?? '';

describe('the location strip follows the unit switch', () => {
  it('shows the design minimum in °F under IP', () => {
    expect(location('IP')).toContain(`${toF(SAMPLE_DESIGN_DAY.minimum).toFixed(1)} °F`);
  });

  it('shows the design minimum in °C under SI', () => {
    expect(location('SI')).toContain(`${SAMPLE_DESIGN_DAY.minimum.toFixed(1)} °C`);
  });

  it('shows the ground temperature in the displayed system', () => {
    expect(location('IP')).toContain('ground 55 °F');
    expect(location('SI')).toContain('ground 13 °C');
  });

  it('converts the ground-drift limit as a DIFFERENCE, not a temperature', () => {
    // 3 K of drift is 5.4 °F of drift, not 37.4 °F. The sibling tool shipped
    // exactly this slip and it stayed silent on the cases it existed to catch.
    const drifted = {
      ...SAMPLE_CONDITIONS,
      groundTemperature: 21,
      groundTemperatureBasis: 'derived' as const,
    };
    const text = (units: UnitSystem) =>
      render(
        <LocationPanel
          site={SAMPLE_SITE}
          designDay={SAMPLE_DESIGN_DAY}
          conditions={drifted}
          units={units}
          onApply={vi.fn()}
        />,
      ).container.textContent ?? '';

    expect(text('IP')).toContain(`${deltaToF(GROUND_DRIFT_LIMIT_K).toFixed(1)} °F`);
    expect(text('SI')).toContain(`${GROUND_DRIFT_LIMIT_K} K`);
  });

  it('leaves no Fahrenheit anywhere on the panel under SI', () => {
    expect(location('SI')).not.toContain('°F');
  });
});

const envelope = (units: UnitSystem) =>
  render(
    <EnvelopePanel
      envelope={SAMPLE_ENVELOPE}
      gains={SAMPLE_GAINS}
      conditions={SAMPLE_CONDITIONS}
      designDay={SAMPLE_DESIGN_DAY}
      units={units}
      scrubHour={null}
      onChange={vi.fn()}
      onExport={vi.fn()}
      exporting={false}
    />,
  );

describe('the sketch-box fields carry a unit and convert', () => {
  it('shows length and width in feet under IP', () => {
    envelope('IP');
    expect((screen.getByLabelText('Box length, ft') as HTMLInputElement).value).toBe(
      toFt(DEFAULT_BOX.length).toFixed(0),
    );
    expect((screen.getByLabelText('Box width, ft') as HTMLInputElement).value).toBe(
      toFt(DEFAULT_BOX.width).toFixed(0),
    );
  });

  it('shows length and width in metres under SI', () => {
    envelope('SI');
    expect((screen.getByLabelText('Box length, m') as HTMLInputElement).value).toBe(
      DEFAULT_BOX.length.toFixed(1),
    );
    expect((screen.getByLabelText('Box width, m') as HTMLInputElement).value).toBe(
      DEFAULT_BOX.width.toFixed(1),
    );
  });

  it('converts storey height too — it is a length, not a count', () => {
    envelope('IP');
    expect((screen.getByLabelText('Box storey height, ft') as HTMLInputElement).value).toBe(
      toFt(DEFAULT_BOX.storeyHeight).toFixed(1),
    );
    cleanup();
    envelope('SI');
    expect((screen.getByLabelText('Box storey height, m') as HTMLInputElement).value).toBe(
      DEFAULT_BOX.storeyHeight.toFixed(1),
    );
  });

  it('leaves the genuinely unitless fields alone', () => {
    envelope('IP');
    const storeysIP = (screen.getByLabelText('Box storeys') as HTMLInputElement).value;
    const wwrIP = (screen.getByLabelText('Box WWR, window-to-wall ratio') as HTMLInputElement).value;
    cleanup();
    envelope('SI');
    expect((screen.getByLabelText('Box storeys') as HTMLInputElement).value).toBe(storeysIP);
    expect((screen.getByLabelText('Box WWR, window-to-wall ratio') as HTMLInputElement).value).toBe(wwrIP);
  });

  it('prints the unit beside every field that has one', () => {
    const ip = envelope('IP').container.textContent ?? '';
    expect(ip).toContain('Length, ft');
    expect(ip).toContain('Width, ft');
    expect(ip).toContain('Storey height, ft');
    cleanup();
    const si = envelope('SI').container.textContent ?? '';
    expect(si).toContain('Length, m');
    expect(si).toContain('Storey height, m');
  });

  it('names the ground temperature from the project, in the displayed system', () => {
    // It was hardcoded "ground at 55 °F" — wrong system under SI, and wrong
    // number entirely on any site whose ground drifted off the rule of thumb.
    expect(envelope('IP').container.textContent).toContain('ground at 55 °F');
    cleanup();
    expect(envelope('SI').container.textContent).toContain('ground at 13 °C');
  });
});

describe('a box entered in feet is a box in feet', () => {
  /**
   * The display half of this bug is embarrassing; THIS half is the expensive
   * one. Unlabelled metres read as feet meant "80 × 60" produced a 4,800 m²
   * floor — 51,667 ft², eleven times the building the user drew — and every
   * downstream verdict followed it without complaint.
   */
  const sketch = (units: UnitSystem, length: string, width: string) => {
    // Called twice inside one test below; without this the second render stacks
    // another panel into the same document and every query finds two.
    cleanup();
    const onChange = vi.fn<(next: Envelope) => void>();
    render(
      <EnvelopePanel
        envelope={SAMPLE_ENVELOPE}
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
    const u = LABELS[units].length;
    for (const [name, value] of [[`Box length, ${u}`, length], [`Box width, ${u}`, width]] as const) {
      const input = screen.getByLabelText(name);
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
    }
    fireEvent.click(screen.getByText('Sketch a box'));
    expect(onChange).toHaveBeenCalled();
    return onChange.mock.calls.at(-1)![0];
  };

  it('reads 80 × 60 as feet under IP', () => {
    const next = sketch('IP', '80', '60');
    // Not to 6 places: M_PER_FT is exact and SQFT_PER_SQM is rounded, so a
    // ft -> m -> ft^2 round trip loses about 1.5e-9 relative. That is the
    // constants disagreeing in the ninth digit, not the conversion being wrong.
    expect(toSqFt(next.floorArea)).toBeCloseTo(80 * 60, 4);
  });

  it('reads 80 × 60 as metres under SI', () => {
    const next = sketch('SI', '80', '60');
    expect(next.floorArea).toBeCloseTo(80 * 60, 6);
  });

  it('puts the two systems a factor of 10.76 apart, not on top of each other', () => {
    // Before the fix both branches returned 4,800 m². That equality IS the bug.
    expect(sketch('SI', '80', '60').floorArea / sketch('IP', '80', '60').floorArea).toBeCloseTo(
      10.7639104,
      6,
    );
  });

  it('carries the storey height through the same conversion', () => {
    const input = () => screen.getByLabelText('Box storey height, ft');
    const onChange = vi.fn<(next: Envelope) => void>();
    render(
      <EnvelopePanel
        envelope={SAMPLE_ENVELOPE}
        gains={SAMPLE_GAINS}
        conditions={SAMPLE_CONDITIONS}
        designDay={SAMPLE_DESIGN_DAY}
        units="IP"
        scrubHour={null}
        onChange={onChange}
        onExport={vi.fn()}
        exporting={false}
      />,
    );
    fireEvent.change(input(), { target: { value: '12' } });
    fireEvent.blur(input());
    fireEvent.click(screen.getByText('Sketch a box'));
    // 12 ft, stored as 3.6576 m — not twelve metres of storey.
    expect(onChange.mock.calls.at(-1)![0].storeyHeight).toBeCloseTo(3.6576, 6);
  });
});

describe('the accessible name contains the visible caption', () => {
  /**
   * WCAG 2.5.3. The caption above each box field carries the unit, so the
   * accessible name has to carry it too — otherwise a voice-control user
   * saying "Length, ft" addresses nothing. This is the check that keeps the
   * two strings from drifting apart the next time a unit is added.
   */
  it.each(['IP', 'SI'] as const)('%s', (units) => {
    const { container } = envelope(units);
    const captions = [...container.querySelectorAll('.eyebrow')]
      .map((node) => node.textContent ?? '')
      .filter((text) => /^(Length|Width|Storey height|Storeys|WWR)\b/.test(text));

    expect(captions).toHaveLength(5);
    for (const caption of captions) {
      const named = [...container.querySelectorAll('input[aria-label]')].filter((input) =>
        (input.getAttribute('aria-label') ?? '').toLowerCase().includes(caption.toLowerCase()),
      );
      expect(named, `no input's accessible name contains “${caption}”`).toHaveLength(1);
    }
  });
});
