// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GainsPanel } from '../src/ui/GainsPanel';
import { DEFAULT_GAINS } from '../src/model/defaults';
import { DEFAULT_VENTILATION } from '../src/model/ventilation';
import { setDensity, setItCooling } from '../src/model/editGains';

/**
 * A control that sets no colour is not neutral — it is system-coloured.
 *
 * The IT cooling chips wrote `color: undefined` for two of their three states,
 * which does not fall back to the shared chip colour: React drops the property
 * and the button takes the UA's `buttontext`. That follows `color-scheme`,
 * which followed the OPERATING SYSTEM rather than the app's own theme — so a
 * viewer whose OS asked for dark and who pressed the light button got white
 * text on a cream panel at 1.04:1.
 *
 * Both halves are pinned here, because either one alone would have hidden it:
 * with the colour set the scheme mismatch is invisible, and with the scheme
 * matched the missing colour merely looks ordinary.
 */
afterEach(cleanup);

const withIt = setItCooling(setDensity(DEFAULT_GAINS, 'itEquipment', 4), 'air');

describe('controls name their own colour', () => {
  it('leaves no IT cooling chip to the system palette', () => {
    const { container } = render(
      <GainsPanel
        gains={withIt}
        floorArea={500}
        units="IP"
        marker={6}
        onChange={vi.fn()}
        ventilation={DEFAULT_VENTILATION}
        onVentilationChange={vi.fn()}
      />,
    );

    const group = container.querySelector('[aria-label="IT cooling"]')!;
    const buttons = [...group.querySelectorAll('button')] as HTMLButtonElement[];
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button.style.color, button.textContent ?? '').not.toBe('');
    }
  });

  /**
   * A source test, like the one on the two solve sites. The rule is invisible
   * until someone pins a theme against their OS, which no component test
   * reaches and no reviewer looking at a matching pair would notice.
   */
  it('makes the UA scheme follow the theme, not the operating system', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../src/ui/styles.css'), 'utf8');
    expect(css).toMatch(/html\[data-theme="light"\]\s*\{\s*color-scheme:\s*light;?\s*\}/);
    expect(css).toMatch(/html\[data-theme="dark"\]\s*\{\s*color-scheme:\s*dark;?\s*\}/);
    // The unpinned third state still defers to the OS, which is correct.
    expect(css).toMatch(/html\s*\{\s*color-scheme:\s*light dark;?\s*\}/);
  });
});
