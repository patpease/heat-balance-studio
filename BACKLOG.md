# Backlog

## Decided, and deliberately not done

**No shared package for tokens or the EPW parsers.** Three tools now exist
(Psychrometric Studio, ZEEL, this one) and the site's rule said to revisit at
the third. Revisited, 11 Sep 2026: **copy once more.** The parsers will have
diverged by the time a third consumer appears — this tool's copy drops the
humidity handling entirely — and extracting a package around two call sites
usually produces an abstraction that fits neither. Every tool currently deploys
as an independent static bundle, which is a property worth protecting.
Revisit when a fourth tool needs EPW.

## v1, by phase

- [x] **00 Scaffold** — Vite + React 19 + TS, vitest, wrangler with all three
      quiet-failure settings, tokens from the canvases with the contrast fix,
      the mark, CSP with no `unsafe-inline`.
- [ ] **01 Engine and the golden case** — `ua.ts`, `gains.ts`, `balance.ts`.
      No network, no UI. Done when the plan's §3.8 fixture reproduces to the
      watt and R ⇄ U is tested in both unit systems.
- [ ] **02 Design-day derivation** — against a committed fixture series, no
      live calls in tests. Includes the ground-temperature resolver either side
      of its 3 K threshold.
- [ ] **03 Envelope panel and the section drawing** — rendered from a
      `BuildingType` record, not inline JSX.
- [ ] **04 Gains panel** — four rows, source chips, schedule bars.
- [ ] **05 Chart, verdict, balance point** — three-part verdict with the
      computed lever line; hover-to-scrub. Verify `feTurbulence` through the
      PNG export **here**, not at phase 08.
- [ ] **06 Live weather** — Worker routes, geocoder, relay, edge cache.
      Done when the tool still answers with the relay switched off.
- [ ] **07 EPW and DDY upload** — lift and trim psychro's parsers.
- [ ] **08 Framing, export, deploy** — scope statement, PNG export (two
      cameras), share link, units toggle, a11y pass, deploy.
      **Copy for this phase needs a starting point from Patrick.**

## v2

- Ventilation and infiltration — the reserved `ventilation` field.
- **Entry by building type** — five more `BuildingType` records plus a picker,
  and the light recolour of the massing set.
- **Reverse entry** from wall-to-floor ratio, height and shape.
- Guidance links hanging off the verdict's lever line.
- Expose the advanced fields held at their defaults in v1: IT `spaceFraction`,
  `bufferFactor`, the flat-day toggle.

## v3

- Solar gains. Same archive call carries irradiance; `DesignHour` already
  reserves `ghi` / `dni` / `dhi`.
- Open design problem: with solar in the model, the cold *clear* day and the
  cold *overcast* day give opposite answers.
