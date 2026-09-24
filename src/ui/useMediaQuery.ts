import { useEffect, useState } from 'react';

/**
 * The width below which the paired rows stack into one column.
 *
 * The same number as `@media (max-width: 1100px)` on `.pair` in styles.css;
 * a custom property cannot carry it into a media query, so it is written
 * twice and the two must agree.
 */
export const STACKED = '(max-width: 1100px)';

/**
 * Whether a media query matches, kept current. False where there is no
 * `matchMedia` — jsdom and the server — which is the desk layout.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const update = (): void => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}
