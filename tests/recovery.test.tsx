// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BalanceChart } from '../src/chart/BalanceChart';
import { Verdict } from '../src/ui/Verdict';
import { solve } from '../src/engine/balance';
import { DEFAULT_CONDITIONS, DEFAULT_ENVELOPE, DEFAULT_GAINS } from '../src/model/defaults';
import { SAMPLE_DESIGN_DAY } from '../src/model/sampleProject';
import type { ItCooling } from '../src/model/types';

/**
 * The third answer, on the screen.
 *
 * The engine tests prove the arithmetic. These prove the thing a user actually
 * meets: a distinct verdict with its own colour, a chart that does not pretend
 * recovered heat is a passive gain, and a drawing that does not draw an arrow
 * into a room that receives nothing.
 */
afterEach(cleanup);

const result = (kW: number, cooling: ItCooling) =>
  solve({
    envelope: DEFAULT_ENVELOPE,
    gains: { ...DEFAULT_GAINS, itEquipment: { kilowatts: kW, cooling } },
    conditions: DEFAULT_CONDITIONS,
    designDay: SAMPLE_DESIGN_DAY,
  });

const verdict = (kW: number, cooling: ItCooling) =>
  render(<Verdict result={result(kW, cooling)} units="IP" />).container.firstElementChild as HTMLElement;

describe('the verdict says which of the three it is', () => {
  it('names recovery rather than claiming self-heating', () => {
    const box = verdict(400, 'chilled-water');
    expect(box.textContent).toMatch(/Heating recovered from cooling/);
    expect(box.textContent).not.toMatch(/Self-heating right through/);
  });

  it('claims self-heating only when the heat is genuinely in the room', () => {
    expect(verdict(400, 'air').textContent).toMatch(/Self-heating right through/);
  });

  it('falls back to short when the heat is rejected', () => {
    const box = verdict(400, 'rejected');
    expect(box.textContent).toMatch(/Not self-heating yet/);
    expect(box.textContent).not.toMatch(/recovered from cooling/);
  });

  it('draws each state in its own accent', () => {
    // Three answers, three colours. A qualified pass in the same green as a
    // real one is the thing this state exists to stop.
    const colour = (kW: number, c: ItCooling) => verdict(kW, c).style.borderColor;
    expect(colour(400, 'air')).toBe('var(--gain)');
    expect(colour(400, 'chilled-water')).toBe('var(--recover)');
    expect(colour(400, 'rejected')).toBe('var(--loss)');
  });

  it('reports the duty the building needs, not the machine it could buy', () => {
    const box = verdict(400, 'chilled-water');
    const r = result(400, 'chilled-water').recovery!;
    const available = Math.round(r.availableAtWorstHour / 1000).toLocaleString('en-US');
    const duty = Math.round(r.peakUsed / 1000).toLocaleString('en-US');
    expect(box.textContent).toMatch(new RegExp(`${available} kW`));
    expect(box.textContent).toMatch(new RegExp(`${duty} kW`));
    expect(Number(duty.replace(/,/g, ''))).toBeLessThan(Number(available.replace(/,/g, '')));
  });

  it('says what is still missing when recovery is not enough', () => {
    expect(verdict(20, 'chilled-water').textContent).toMatch(/closes \d+ of the \d+ short hours/);
  });
});

describe('the chart keeps the gain line passive', () => {
  const chart = (kW: number, cooling: ItCooling) =>
    render(
      <BalanceChart
        result={result(kW, cooling)}
        floorArea={DEFAULT_ENVELOPE.floorArea}
        units="IP"
        hoveredHour={null}
        onHoverHour={vi.fn()}
      />,
    );

  const lines = () =>
    Array.from(document.querySelectorAll('polyline')).map((p) => p.getAttribute('stroke'));

  it('adds a recovery line only when there is something to recover', () => {
    chart(400, 'chilled-water');
    expect(lines()).toContain('var(--recover)');
    cleanup();
    chart(400, 'air');
    expect(lines()).not.toContain('var(--recover)');
  });

  it('does not move the passive gain curve when the medium changes', () => {
    // The deficit shading measures to this curve. If recovery crept into it,
    // the shading would understate what the space is actually short.
    chart(0, 'air');
    const passive = Array.from(document.querySelectorAll('polyline'))
      .find((p) => p.getAttribute('stroke') === 'var(--gain)')!
      .getAttribute('points');
    cleanup();
    chart(400, 'chilled-water');
    const withRecovery = Array.from(document.querySelectorAll('polyline'))
      .find((p) => p.getAttribute('stroke') === 'var(--gain)')!
      .getAttribute('points');
    expect(withRecovery).toBe(passive);
  });

  it('caps the recovery line at the loss curve so the axis stays readable', () => {
    // Uncapped, a 400 kW hall puts this line four times above the loss curve
    // and flattens the two curves the chart exists to compare.
    chart(400, 'chilled-water');
    const y = (stroke: string) =>
      document
        .querySelector<SVGPolylineElement>(`polyline[stroke="${stroke}"]`)!
        .getAttribute('points')!
        .split(/\s+/)
        .map((p) => Number(p.split(',')[1]));
    const recovered = y('var(--recover)');
    const loss = y('var(--loss)');
    const gain = y('var(--gain)');
    for (let i = 0; i < recovered.length; i++) {
      // SVG y grows downward, so "no higher than" is y >= the other's y.
      // The cap is max(gain, loss): in a deficit hour the line stops at the
      // loss curve, and in a surplus hour there is no gap to close so it simply
      // rides the gain curve.
      const ceiling = Math.min(loss[i]!, gain[i]!);
      expect(recovered[i]!, `hour ${i}`).toBeGreaterThanOrEqual(ceiling - 0.05);
      // And never below the passive curve — recovery adds, it does not subtract.
      expect(recovered[i]!, `hour ${i}`).toBeLessThanOrEqual(gain[i]! + 0.05);
    }
  });

  it('meets the loss curve in the hours recovery closes', () => {
    // The visual claim: where the dashed line touches the loss line, that hour
    // is covered. If it never touched, "recovered" would be unreadable.
    chart(400, 'chilled-water');
    const at = (stroke: string) =>
      document
        .querySelector<SVGPolylineElement>(`polyline[stroke="${stroke}"]`)!
        .getAttribute('points')!
        .split(/\s+/)
        .map((p) => Number(p.split(',')[1]));
    const recovered = at('var(--recover)');
    const loss = at('var(--loss)');
    const touching = recovered.filter((v, i) => Math.abs(v - loss[i]!) < 0.05).length;
    expect(touching).toBeGreaterThan(0);
  });
});
