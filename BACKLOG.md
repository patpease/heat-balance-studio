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
- [x] **01 Engine and the golden case** — `ua.ts`, `gains.ts`, `balance.ts`.
      No network, no UI. 84 tests. The §3.8 fixture reproduces exactly; the
      lever moved from a conductance share to the worst hour's loss share (49% -> 45%).
- [x] **02 Design-day derivation** — against a committed fixture series, no
      live calls in tests. 117 tests. Found and fixed the archive timezone bug
      (see CLAUDE.md); the ground resolver is tested either side of its 3 K
      threshold; six climates derived and tabulated in the plan.
- [x] **03 Envelope panel and the section drawing** — rendered from a
      `BuildingType` record, not inline JSX. 136 tests. Editable area/U/R cells,
      click-to-select both ways, sketch-a-box, per-project arrow reference.
- [x] **04 Gains panel** — four rows, source chips, draggable schedule bars,
      IT presets. 158 tests. No advanced field on screen: φ stays at 1 and
      `editGains` has no path to it.
- [x] **05 Chart, verdict, balance point** — 178 tests. Hover-to-scrub drives
      the section. `feTurbulence` VERIFIED through the PNG export: 8,296 pixels
      differ between a filtered and an unfiltered raster, so the filter renders
      rather than being silently dropped, and zero black pixels means no
      `var()` fell back.
- [x] **06 Live weather** — Worker routes, geocoder, relay, edge cache, the
      same handlers mounted on the dev server. 199 tests. The tool makes ZERO
      network calls at boot and a failed search leaves the loaded design day in
      place, so "works with the relay down" is structural rather than handled.
- [x] **07 EPW and DDY upload** — lifted and trimmed from psychro. 215 tests.
      The DDY supplies the published minimum, the EPW supplies the shape.
      Verified against a real Climate.OneBuilding archive.
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
