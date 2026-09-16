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
- [x] **08 Framing, export, share, a11y** — 238 tests. Copy centralised in
      `src/config/copy.ts` for Patrick to edit; scope statement and assumptions
      on the page; share link; units toggle; headings and field labels.
- [x] **Deploy** — live at heatbalance.peasestudio.com, 13 Sep 2026.
- [x] **Sourced gain densities** — sheet 1 returned 13 Sep 2026 with 13 building
      types. `npm run import:gains` generates `src/model/gainPresets.ts`; the
      picker sits in the gains panel.
- [ ] **Citation editions** — all 52 sources name a document but no edition or
      table, so a reader cannot look the numbers up. The importer reports them
      on every run.
- [x] **Per-type schedules** — from the PNNL scorecards, 13 Sep 2026. Weekday,
      area-weighted across each prototype's space types.
- [x] **Entry by building type** — 18 types, 6 massings, drawing follows the
      picker.
- [ ] **A warehouse massing.** It currently borrows the single-family shed,
      which Patrick accepted for v1. It is the one mapping that is a placeholder
      rather than a reading.
- [ ] **Saturday and Sunday schedules.** The source publishes them; only the
      weekday is imported, because a heating design day is the cold weekday.
- [ ] **Copy review** — `src/config/copy.ts`, four `DRAFT_NOTES` open.
- [x] **peasestudio.com tool card** — the MDX is in the content collection at
      `order: 3`, rewritten 13 Sep 2026 for the PNNL data.
- [ ] **Widen the ERA5-vs-DDY comparison** — measured for Boston only (2.2 K).
      Was "drop four more archives on the tool"; the weather-file UI is hidden
      now, so this is a script against `climate/weatherFile.ts` instead. The
      parsers are untouched and still tested.
- [x] **IT as an absolute kW** — 16 Sep 2026. It was a W/m² density, which meant
      a server room got bigger when the building did.
- [x] **Heat recovered from cooling** — 16 Sep 2026. φ is gone, replaced by a
      cooling medium per IT row; four verdict states; recovery credited at the
      condenser heat and sized to the heating demand.
- [x] **Flat design day** — 16 Sep 2026. Exposed in the location strip, off by
      default.
- [x] **Thousands separators, outdoor-air line, one-screen layout, theme
      toggle** — 13–16 Sep 2026.

## v2

- [ ] **Ventilation and infiltration** — the reserved `ventilation` field.
      **The next thing worth building.** It is the largest omission the tool
      states about itself, the reason a passing result is called optimistic,
      and the architecture was shaped for it: `balance.ts` reduces a list of
      labelled term functions, volume is already captured, and a v1 file has no
      `ventilation` key so there is no migration. Everything else on this list
      refines a tool whose headline caveat is still in place.
- [x] **Entry by building type** — 13 Sep 2026. 18 types, 6 massings, and the
      drawing follows the picker.
- [ ] **Reverse entry** from wall-to-floor ratio, height and shape.
- [ ] Guidance links hanging off the verdict's lever line.
- [x] **The advanced fields held at their defaults in v1** — 16 Sep 2026, and
      the outcome was not what this line expected:
      - IT `spaceFraction` (φ) — **not exposed. Removed.** A hidden fraction was
        the wrong shape of control. It is now a cooling medium per IT row: air
        into the space, chilled water with the heat recovered, or rejected.
      - The flat-day toggle — **exposed**, in the location strip.
      - `bufferFactor` — **exposed, then withdrawn the same day.** A sixth
        column and a Greek-letter factor cost every user interface for a case
        most do not have. The engine still applies b and the 'buffer' boundary
        still works; surfaces are locked to air at b = 1, ground floor to
        ground. Exposing it is still a UI change whenever it earns one.

## v3

- Solar gains. Same archive call carries irradiance; `DesignHour` already
  reserves `ghi` / `dni` / `dhi`.
- Open design problem: with solar in the model, the cold *clear* day and the
  cold *overcast* day give opposite answers.
