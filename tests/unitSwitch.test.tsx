// @vitest-environment jsdom
import { DEFAULT_VENTILATION } from '../src/model/ventilation';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EnvelopePanel } from '../src/ui/EnvelopePanel';
import { LocationPanel } from '../src/ui/LocationPanel';
import { DEFAULT_BOX } from '../src/engine/sketchBox';
import type { UnitSystem } from '../src/model/types';
import {
  SAMPLE_CONDITIONS,
  SAMPLE_DESIGN_DAY,
  SAMPLE_ENVELOPE,
  SAMPLE_GAINS,
  SAMPLE_SITE,
} from '../src/model/sampleProject';
import type { Envelope } from '../src/model/types';
import { BTU_H_PER_WATT, LABELS, toF, toFt, toSqFt } from '../src/model/units';

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
    // The wording says what the number does — held constant for all 24 hours —
    // rather than where it came from. The unit is what this test is about.
    expect(location('IP')).toContain('assumed constant at 55 °F');
    expect(location('SI')).toContain('assumed constant at 13 °C');
  });

  /**
   * The ground line reports its value and stops.
   *
   * It used to carry the provenance, the drift, the month and the reason the
   * figure stopped at freezing — four clauses explaining one number. The
   * temperature-DIFFERENCE trap it contained (3 K of drift is 5.4 °F, not
   * 37.4 °F) went with them, and `units.test.ts` guards that at the function.
   */
  it('says the value and nothing else', () => {
    const derived = {
      ...SAMPLE_CONDITIONS,
      groundTemperature: 0,
      groundTemperatureBasis: 'derived' as const,
    };
    const text = (units: UnitSystem) =>
      render(
        <LocationPanel
          site={SAMPLE_SITE}
          designDay={SAMPLE_DESIGN_DAY}
          conditions={derived}
          units={units}
          onApply={vi.fn()}
        />,
      ).container.textContent ?? '';

    expect(text('IP')).toContain('ground temperature assumed constant at 32.0 °F');
    expect(text('SI')).toContain('ground temperature assumed constant at 0.0 °C');
    for (const clause of ['mean', 'freezing', 'from the default', 'February']) {
      expect(text('IP')).not.toContain(clause);
    }
  });

  it('leaves no Fahrenheit anywhere on the panel under SI', () => {
    expect(location('SI')).not.toContain('°F');
  });
});

/**
 * The sketch-box fields live behind the dimensions drawer, which is shut on
 * load. Every test below is about what those fields say once they are on
 * screen, so the helper opens it — the drawer's own behaviour is pinned in
 * `tests/dimensionsDrawer.test.tsx` instead.
 */
const openDimensions = () => fireEvent.click(screen.getByText('Dimensions'));

const envelope = (units: UnitSystem) => {
  const result = render(
    <EnvelopePanel
      envelope={SAMPLE_ENVELOPE}
      gains={SAMPLE_GAINS}
      ventilation={DEFAULT_VENTILATION}
      conditions={SAMPLE_CONDITIONS}
      designDay={SAMPLE_DESIGN_DAY}
      units={units}
      scrubHour={null}
      onChange={vi.fn()}
      onExport={vi.fn()}
      exporting={false}
    />,
  );
  openDimensions();
  return result;
};

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
    expect((screen.getByLabelText('Box height, ft') as HTMLInputElement).value).toBe(
      toFt(DEFAULT_BOX.height).toFixed(1),
    );
    cleanup();
    envelope('SI');
    expect((screen.getByLabelText('Box height, m') as HTMLInputElement).value).toBe(
      DEFAULT_BOX.height.toFixed(1),
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
    expect(ip).toContain('Height, ft');
    cleanup();
    const si = envelope('SI').container.textContent ?? '';
    expect(si).toContain('Length, m');
    expect(si).toContain('Height, m');
  });

  it('does not repeat the ground temperature in the surface row', () => {
    // It used to read "Ground floor · ground at 55 °F". The location strip
    // already states the ground temperature and its basis, and the repeat cost
    // width that the row needs for the numbers.
    expect(envelope('IP').container.textContent).not.toContain('ground at');
    cleanup();
    expect(envelope('SI').container.textContent).not.toContain('ground at');
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
    openDimensions();
    const u = LABELS[units].length;
    for (const [name, value] of [[`Box length, ${u}`, length], [`Box width, ${u}`, width]] as const) {
      const input = screen.getByLabelText(name);
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
    }
    fireEvent.click(screen.getByText('Create surfaces'));
    expect(onChange).toHaveBeenCalled();
    return onChange.mock.calls.at(-1)![0];
  };

  const STOREYS = DEFAULT_BOX.storeys;

  it('reads 80 × 60 as feet under IP', () => {
    const next = sketch('IP', '80', '60');
    // Not to 6 places: M_PER_FT is exact and SQFT_PER_SQM is rounded, so a
    // ft -> m -> ft^2 round trip loses about 1.5e-9 relative. That is the
    // constants disagreeing in the ninth digit, not the conversion being wrong.
    expect(toSqFt(next.floorArea)).toBeCloseTo(80 * 60 * STOREYS, 3);
  });

  it('reads 80 × 60 as metres under SI', () => {
    const next = sketch('SI', '80', '60');
    expect(next.floorArea).toBeCloseTo(80 * 60 * STOREYS, 6);
  });

  it('puts the two systems a factor of 10.76 apart, not on top of each other', () => {
    // Before the fix both branches returned 4,800 m². That equality IS the bug.
    expect(sketch('SI', '80', '60').floorArea / sketch('IP', '80', '60').floorArea).toBeCloseTo(
      10.7639104,
      6,
    );
  });

  it('carries the height through the same conversion', () => {
    const input = () => screen.getByLabelText('Box height, ft');
    const onChange = vi.fn<(next: Envelope) => void>();
    render(
      <EnvelopePanel
        envelope={SAMPLE_ENVELOPE}
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
    openDimensions();
    fireEvent.change(input(), { target: { value: '12' } });
    fireEvent.blur(input());
    fireEvent.click(screen.getByText('Create surfaces'));
    // 12 ft overall over four storeys, so 3 ft a storey — stored in metres, and
    // not twelve metres of building.
    expect(onChange.mock.calls.at(-1)![0].storeyHeight).toBeCloseTo(3.6576 / STOREYS, 6);
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
      .filter((text) => /^(Length|Width|Height|Storeys|WWR)\b/.test(text));

    expect(captions).toHaveLength(5);
    for (const caption of captions) {
      const named = [...container.querySelectorAll('input[aria-label]')].filter((input) =>
        (input.getAttribute('aria-label') ?? '').toLowerCase().includes(caption.toLowerCase()),
      );
      expect(named, `no input's accessible name contains “${caption}”`).toHaveLength(1);
    }
  });
});

/**
 * The loss column was the last number on the page still stuck in watts.
 *
 * It is a heat FLOW — the whole loss through one surface — so IP wants Btu/h.
 * The chart beside it plots Btu/h·ft², the same quantity over an area, and the
 * two being different by a factor of the floor area is exactly why reading one
 * against the other in mixed units was a trap worth closing.
 */
describe('the loss column follows the unit switch', () => {
  const lossCells = () =>
    Array.from(document.querySelectorAll('tbody tr'))
      .map((row) => row.lastElementChild?.textContent ?? '')
      .filter((text) => /\d/.test(text));

  it('reports Btu/h under IP', () => {
    envelope('IP');
    const cells = lossCells();
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) expect(cell).toMatch(/Btu\/h$/);
  });

  it('reports W under SI', () => {
    envelope('SI');
    for (const cell of lossCells()) expect(cell).toMatch(/ W$/);
  });

  it('puts the two systems a factor of 3.412 apart, not on top of each other', () => {
    // The silent failure this catches is a relabelled column: the unit swapped
    // to Btu/h while the number stayed in watts.
    const read = (units: UnitSystem) => {
      cleanup();
      envelope(units);
      return Number(lossCells()[0]!.replace(/[^\d.]/g, ''));
    };
    const si = read('SI');
    const ip = read('IP');

    expect(si).toBeGreaterThan(0);
    expect(ip / si).toBeCloseTo(BTU_H_PER_WATT, 1);
  });

  it('groups the digits, so a five-figure loss is readable', () => {
    envelope('IP');
    // Every loss in the worked example clears a thousand Btu/h.
    for (const cell of lossCells()) expect(cell).toMatch(/^\d{1,3}(,\d{3})+ Btu\/h$/);
  });
});
