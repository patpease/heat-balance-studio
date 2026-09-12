# Heat Balance Studio

Can this building be designed to need no heating at all? Five envelope surfaces,
ASHRAE-style internal gains, and a 24-hour balance against a derived cold design
day. An early-stage screen, not a certification tool. Everything runs in the
browser: no account, no upload, nothing kept. MIT.

It is a **Cloudflare Worker, not a Pages site.** They are different products and
the difference has broken a sibling's deploy: a `functions/` directory is
ignored here, and a route that should 404 instead returns the SPA shell with a
200. The Worker entry point is `worker/index.ts`.

**Read this file first.** The full reasoning — methodology, the eleven settled
decisions, the worked example, the interface spec — lives in the plan artifact
and is a record of *why*, not an orientation.

## Layout

```
src/model/       types, defaults, schedule presets. Zero deps, zero React.
src/engine/      the calculation. Pure functions, no fetch, no DOM.
src/climate/     design-day derivation, Open-Meteo, EPW/DDY. Pure where it can be.
src/chart/       hand-drawn SVG. No charting library.
src/ui/          App, panels, tokens, the mark.
src/io/          share link, PNG export.
src/config/      branding and the standing scope statements.
worker/          the Worker entry point. An adapter and nothing more.
```

## The rules the code is built on

1. **Canonical SI, converted at the display edge.** Watts, kelvin, m², W/m²K,
   °C. IP is a display transform, never a storage format. The trap is the
   U ⇄ R field: the conversion is a reciprocal, so a unit bug there is silent
   and large. It gets its own test in both directions.
2. **One unit system on screen at a time, never two.** Default display is IP.
   The Passive House line reads `3.2 Btu/h·ft²` in IP and `10 W/m²` in SI — not
   both at once.
3. **Loss is positive outward, gain positive inward, net is gain minus loss.**
   A positive net means the space is self-heating that hour.
4. **`balance.ts` reduces a list of labelled term functions**, never a single
   UA and a single gain. That is what makes v2's ventilation term a push rather
   than surgery on the core — and the chart's stacked breakdown comes free.
5. **The section drawing is rendered from a `BuildingType` record, not inline
   JSX.** v2 adds five more records and a picker; the renderer does not change.
   The `data-surface` slot names are the contract between drawing and engine.
6. **The Worker is an adapter.** Host pinning, cache keys, error text and the
   design-day derivation live in `src/climate/`, which the Vite dev server also
   serves — so the logic running at the edge is the logic exercised locally.
7. **A number badged with a standard's name must be cited.** The gain defaults
   carry a source per density, through to the field help text. Unverified rows
   do not ship.

## Verifying a change

```bash
npm run typecheck && npm test && npm run build
npm run preview:worker   # the ONLY place the CSP and the routes are true
```

**A green suite is not evidence the browser works, and a green build is not
evidence the deploy works.** Both lessons cost a sibling a shipped failure.
`npm run dev` serves on 5184; `preview:worker` on 8789.

**Measure performance on the production build, never the dev one.** React's
development build is several times slower — a sibling optimised against a dev
number that no user ever had.

## Things that look right and are not

- **`<img src>` for the product mark.** An `<img>` cannot see the theme, so the
  light tile lands on the dark ground; `<picture>` with `prefers-color-scheme`
  fixes two of the three theme states and still breaks the explicit
  `data-theme` one. The mark is inlined in `ui/Mark.tsx` and every colour is a
  token. Caught in phase 00, in the browser, after the build was green.
- **Adding a token to one dark block and not the other.** The palette is
  declared three times and plain CSS cannot share a block between a media query
  and a bare selector. A token in only one falls back to an initial value —
  which for `fill` is opaque black. `tests/theme.test.ts` guards it.
- **Taking the canvas's `#6B7F77` for `--muted`.** It measures 4.05:1 on the
  panel and fails WCAG AA at the 11px label sizes it is used at. `#5B6E66`
  (5.16:1) is already in the palette as the ground line. The dark palette needs
  no such fix — it is the cleaner of the two.
- **Gain-coloured text on the page ground.** `#2F7D6E` is 4.66:1 on the panel
  but 4.27:1 on `--page`. Loss and gain carry *marks* anywhere and *text* only
  on `--panel`.
- **Silently taking the geocoder's first result.** It is fuzzy: "Boston,
  Massachusetts" returns Boston then *Pittsfield*. The right answer is reliably
  first, so this is right almost always and wrong invisibly — and a design day
  derived for the wrong town never announces itself. Show the match, offer the
  alternatives.
- **A `k` floor that draws a stub arrow for a 0 W term.** People at 06:00 is
  exactly zero. An unoccupied hour must draw no people arrow at all, or the
  drawing asserts a gain that is not there.
- **A fixed 800 W arrow reference.** Real values saturate it — the worked
  example's windows term is 4,063 W against a clamp equivalent to 1,840 W, so
  windows and roof render identically despite a 1.5× difference. Derive the
  reference per project, and hold it constant across the 24 hours so scrubbing
  shows the gains genuinely collapsing overnight.

## Where the detail lives

| Question | File |
|---|---|
| What is planned next, and what was deliberately not done | `BACKLOG.md` |
| Every type the engine works in, and why each field exists | `src/model/types.ts` |
| The three Worker settings that fail quietly | `wrangler.jsonc` |
| The palette, both themes, and the contrast correction | `src/ui/tokens.css` |
| The standing scope statements | `src/config/branding.ts` |

## The timezone bug, and why it is worth knowing about

Open-Meteo's archive **applies one fixed UTC offset to an entire response —
whichever is in force when the request is made, not whichever applied on the
data's own date.** Ask for January 2024 in September and every timestamp comes
back labelled GMT−4 rather than GMT−5. There is no DST discontinuity to notice:
every day has exactly 24 hours, so nothing looks wrong.

Left alone, a winter profile is labelled an hour late *and the size of the error
depends on the month the tool is used in* — the same building in the same city
would derive a different design day in January than in July.

So `archiveUrl` asks for `timezone=UTC` and `standardOffsetSeconds` supplies the
site's standard-time offset from its IANA zone. Standard, never daylight: a
heating design day is a winter condition. The offset is the smaller of a zone's
January/July pair, which is also correct in the southern hemisphere and for
zones without DST.

It changed the answer. Boston's minimum moved from hour 7 to hour 6, cold days
from 76 to 80, the worked example from 16 deficit hours to 15 and from 14.4 to
14.7 W/m² short. **It also cost a finding**: the claim that the worst hour fell
an hour *before* the coldest hour was an artefact of the mislabelling. The two
coincide. What survives is the real point — 07:00 is only 0.5 K milder than
06:00 but its net is 2,000 W better, because occupancy starts.

## The section drawing

`SectionDrawing` renders whichever `BuildingType` record it is handed. v2's five
extra massings are five more records and a picker; this component does not
change. `data-surface` names in the canvas and `SurfaceSlot` in the model are
the same strings on purpose — that is the contract.

Three departures from the canvas, each of which only shows up on real numbers:

- **The arrow reference is derived per project, not fixed at 800 W.** The
  canvas clamps at about 1,840 W, and the worked example's windows term is
  4,129 W — windows and roof would both peg at the ceiling and render
  identically despite a 1.5× difference. The reference is set from the largest
  term so that arrow lands exactly at the top of the range.
- **It is computed once over all 24 hours, never per hour.** Per-hour
  normalisation would rescale the drawing as you scrub and hide the gains
  collapsing overnight, which is the thing scrubbing is for.
- **The sketch filter is on the shell only, not the arrows.** The canvas filters
  the whole artwork, which would re-run a displacement map over everything on
  every frame of a drag.

`useId` per instance for the filter and pattern ids: the PNG export mounts a
second copy of this drawing, and duplicate ids would have one clone steal the
other's filter.
