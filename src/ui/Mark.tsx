/**
 * The product mark, drawn inline rather than loaded as a file.
 *
 * Both canvases ship a mark — `heat-balance-icon.svg` and its dark twin — and
 * the obvious thing is to `<img src>` one of them. That is wrong in a way the
 * light theme hides: an `<img>` cannot see the theme, so the light tile ends up
 * on the dark ground. A `<picture>` with `prefers-color-scheme` fixes two of the
 * three theme states and still breaks the third, because this app also honours
 * an explicit `data-theme` stamp that a media query knows nothing about.
 *
 * So the mark is inlined and every colour comes from a token. All five map
 * exactly onto tokens that already exist, which is what "a mark inverts as a
 * unit" is supposed to mean:
 *
 *   tile          --panel
 *   massing       --ink, filled with --massing-fill at --massing-fill-opacity
 *   loss arrows   --loss
 *   gain arrow    --gain
 *
 * The two SVG files stay in `public/` for the favicon and for anywhere outside
 * the app that needs a static asset.
 *
 * Geometry is byte-identical between the light and dark canvases — verified,
 * not assumed — so there is exactly one set of paths here.
 */
export function Mark({ size = 48 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      role="img"
      aria-label="Heat Balance Studio"
      style={{ display: 'block' }}
    >
      <rect width="96" height="96" fill="var(--panel)" />
      <g strokeLinecap="round" strokeLinejoin="round" fill="none">
        <g stroke="var(--ink)" strokeWidth="4">
          <path
            d="M28 70 C 27 62 29 52 28 44 C 35 38 42 32 48 30 C 54 33 61 38 68 44 C 67 53 69 62 68 70 C 61 71 54 69 48 70 C 41 71 35 69 28 70 Z"
            fill="var(--massing-fill)"
            fillOpacity="var(--massing-fill-opacity)"
          />
          <path d="M24 46 C 32 39 41 32 48 29 C 56 33 64 40 72 46" />
        </g>
        <g stroke="var(--loss)" fill="var(--loss)" strokeWidth="4">
          <path d="M62 38 C 68 33 72 29 77 24" />
          <path d="M78 23 L 70 24 L 77 30 Z" stroke="none" />
          <path d="M70 58 C 76 59 81 57 87 58" />
          <path d="M89 58 L 81 53 L 81 63 Z" stroke="none" />
          <path d="M40 74 C 41 79 39 83 40 88" />
          <path d="M40 90 L 35 82 L 45 82 Z" stroke="none" />
        </g>
        <g stroke="var(--gain)" fill="var(--gain)" strokeWidth="4">
          <path d="M56 64 C 57 59 55 55 56 50" />
          <path d="M56 48 L 51 56 L 61 56 Z" stroke="none" />
        </g>
      </g>
    </svg>
  );
}
