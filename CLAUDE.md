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
