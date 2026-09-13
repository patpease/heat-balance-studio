/**
 * Sun and moon, reused from psychrometric-studio.
 *
 * The geometry is copied path-for-path from that tool's `sun.svg` and
 * `moon.svg` so the two studios offer the same control drawn the same way.
 *
 * One thing is NOT copied: the sibling hard-codes its accent hexes (#E2842F on
 * the rays, #2F9BD6 on the stars). Those are its palette, not this one's, and a
 * fixed orange would be the only colour on this page that ignores the theme.
 * They map onto tokens that already carry the same warm/cool split — `--loss`
 * for anything solar, `--gain` for anything cold — which is the same rule
 * `Mark.tsx` follows.
 *
 * Inline rather than an `<img>`, for the reason set out in `Mark.tsx`: an image
 * cannot see `data-theme`.
 */
export function ThemeIcon({ name, size = 17 }: { name: 'sun' | 'moon'; size?: number }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: 'block' }}
    >
      {name === 'sun' ? (
        <>
          <circle cx="24" cy="24" r="9" stroke="currentColor" strokeWidth="3" />
          <path
            d="M24 11V5M24 43V37M37 24H43M5 24H11M33.2 14.8L37.4 10.6M10.6 37.4L14.8 33.2M33.2 33.2L37.4 37.4M10.6 10.6L14.8 14.8"
            stroke="var(--loss)"
            strokeWidth="3"
          />
        </>
      ) : (
        <>
          <path d="M40 30.5A17 17 0 0 1 17.5 8 17 17 0 1 0 40 30.5Z" stroke="currentColor" strokeWidth="3" />
          <circle cx="35" cy="12" r="1.8" fill="var(--gain)" />
          <circle cx="41" cy="19" r="1.4" fill="var(--gain)" />
        </>
      )}
    </svg>
  );
}
