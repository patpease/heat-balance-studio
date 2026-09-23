import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Below this many CSS pixels a panel takes its phone layout.
 *
 * The JS half of the `@container (max-width: 600px)` rules in styles.css — the
 * drawing's markers and the compact chart are decided here, the envelope cards
 * there, and all three read the width of a panel rather than of the viewport so
 * they cannot disagree about which layout is showing.
 *
 * 600 because that is where the text did. The section drawing is 1,028 units
 * wide and labels at 13, so under 600 px they render below 7.6 px; the chart is
 * 880 wide with 11-unit ticks, which cross the same line at the same width.
 */
export const COMPACT_BELOW = 600;

/**
 * The rendered width of an element, kept current.
 *
 * **Zero means unknown, and unknown means desktop.** jsdom lays nothing out and
 * reports every box as 0 × 0; a test that mounted a panel would otherwise get
 * the phone layout it never asked for. The first real measurement happens in a
 * layout effect, before paint, so a phone never sees the desktop frame either.
 *
 * The PNG export depends on this: it mounts a copy in an 880 px box off
 * screen, which measures wide and renders the desktop layout, so an image
 * exported from a phone is the same figure as one exported from a desk.
 */
export function useWidth(ref: RefObject<Element | null>): { width: number; compact: boolean } {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(Math.round(element.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return { width, compact: width > 0 && width < COMPACT_BELOW };
}
