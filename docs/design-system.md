# Design system — layout and touch

The palette, both themes and the contrast corrections are documented where they
are declared, in `src/ui/tokens.css`. This file covers what the palette does
not: how the tool lays itself out on a phone, and the rules that keep that
working. The same rules are intended for Psychrometric Studio and ZEEL, so the
three tools behave as one suite on a small screen as well as a large one.

## Breakpoints

A custom property cannot be used in a media or container query, so these are
numbers, and the places that use them must agree.

| Width | Measured against | What changes |
|---|---|---|
| 1100px | viewport | The paired rows (drawing beside chart, verdict beside balance point) stack into one column. |
| 640px | viewport | Phone chrome: the page gutter tightens from 20px to 10px and the footer stacks. |
| 600px | the panel (container) | The panel's phone layout: envelope cards, numbered markers, the compact chart, gains strips at full width, *How it works* stacked. |

**The phone layout keys on the panel, not the viewport.** A panel that opts in
carries `.cq` (`container-type: inline-size`), and its rules sit in
`@container (max-width: 599px)`. The JavaScript half of the same number is
`COMPACT_BELOW` in `src/chart/useWidth.ts`, which decides the markers and the
compact chart. Both measure the same kind of box, so there is no width at which
the cards show while the drawing is still labelled.

## Tokens

Declared once, in the layout block at the foot of `tokens.css`:

| Token | Value | Why |
|---|---|---|
| `--gutter` | 20px, 10px under 640px | Page padding. 20px each side is 10% of a phone. |
| `--tap` | 44px | Smallest touch target: Apple's 44pt, WCAG 2.5.5 AAA. |
| `--field-font-touch` | 16px | Below this, iOS Safari zooms the page when a field takes focus. |

## Touch

Touch rules key on `@media (pointer: coarse)`, never on width: a narrow window
on a desk has a mouse, and a tablet in landscape does not.

- Every `input`, `select` and `textarea` renders at `--field-font-touch`.
- Every button, select and number cell is at least `--tap` tall.
- Number cells show their border at rest. On a desk they are flush until
  hovered; a phone has no hover, so a field has to look like one first.
- `index.html` sets `viewport-fit=cover` and `.app-main` pads with
  `env(safe-area-inset-*)`, so nothing sits under a notch or the home bar.
- A chart that scrubs on a sideways drag takes `touch-action: pan-y`, never
  `none`: `none` turns the chart into a patch of screen the page cannot be
  scrolled through.

## Charts: a layout per width, not a picture scaled down

An SVG with a fixed viewBox scales its text with its box. The 880-unit chart
at 360px wide rendered its 11-unit ticks at 4.5px. Shrinking a desktop drawing
is not a phone layout.

- **The 24-hour chart** is drawn at its rendered width when compact, so one
  unit is one pixel and the type is the size it says. It is taller for its
  width, ticks every six hours, and splits the axis caption over two lines.
- **The section drawing** cannot do the same: it is 1,028 units of fixed
  artwork, and labels at a readable size would collide with the building. On a
  phone each arrow instead gets a **numbered marker**, drawn at a fixed 20px on
  screen, just past its arrowhead, clamped inside the frame and kept clear of
  other markers and other arrows (`markerSpots`). The key under the drawing and
  the badge on each envelope card use the same numbers (`markerNumbers`).
- **Exports always use the desktop layout.** An exported figure outlives the
  page, and a project must export the same picture from any device. When the
  live figure is in its phone layout, the export mounts a desktop copy off
  screen (`src/ui/offscreen.tsx`) and shoots that. Phone and desktop exports
  are byte-identical.

## Tables: cards on a phone

A table wider than its screen either clips its last column or shrinks its type
below reading size. Under 600px the envelope table becomes one card per row,
from the same DOM:

- the name and its loss share the first line;
- the fields sit below, each with its column heading printed above it from
  `data-label`;
- rows that are not surfaces (ventilation, infiltration, gross floor area)
  span the full width where they have no U or R.

The table's cell styles are inline, so the card rules need `!important`. All of
them are inside the container query, and none of them reaches the desktop.

## Checking a layout change

Tests cannot see a layout. jsdom measures every box as 0, which `useWidth`
treats as desktop, and `tests/mobileLayout.test.tsx` stubs the width to reach
the phone path. After any layout change, open the page in a browser:

- at 360, 375, 390 and 430px wide, with no horizontal scroll;
- in both themes and both unit systems;
- at 1440 and 1024px, to confirm the desktop is unchanged.
