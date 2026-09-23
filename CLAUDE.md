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

Anything printed with a unit reads it from `LABELS[units]`, and any temperature
literal in JSX is a bug waiting to be found — `· ground at 55 °F` sat in the
envelope table for eight phases, wrong in SI and wrong on any site whose annual
mean pulls the ground off the rule of thumb.

## Verifying a change

```bash
npm run typecheck && npm test && npm run build
npm run preview:worker   # the ONLY place the CSP and the routes are true
```

**A green suite is not evidence the browser works, and a green build is not
evidence the deploy works.** Both lessons cost a sibling a shipped failure.
`npm run dev` serves on 5185 and `npm run preview` on 4185 — zeel holds
5184/4184, and every port here is `strictPort` so a clash fails loudly instead
of hopping. `preview:worker` is on 8789 (psychro 8788, zeel the wrangler
default).

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
- **A cache rule that matches a PATH being applied to a FAILURE.** `_headers`
  stamps `/assets/*` with `max-age=31536000, immutable`, and that matched the
  404 too. Every deploy has a window where the new index.html is live before an
  edge has the new bundle; a browser loading the site then caches the 404 **for
  a year** and shows a blank page from that moment on — no console error worth
  acting on, and a reload is served from the same poisoned entry. It took this
  tool down on a real deploy. The worker now sets `no-store` on any non-2xx
  from `ASSETS.fetch`. Psychrometric Studio had the same rule and a worse
  version of the symptom: `not_found_handling: "single-page-application"` meant
  a missing asset answered **200 with the HTML shell**, so there was no 404 to
  catch and the browser cached HTML at a .js URL for a year.
- **Trusting curl to tell you the page is fine.** It returned 200 throughout,
  because the origin WAS healthy — the poisoned copy was in the browser. The
  test that settles it in one call is fetching the identical URL two ways from
  inside the page: `fetch(url)` against `fetch(url, { cache: 'reload' })`.
  Different statuses means the cache, not the server.
- **A `<select>` whose value matches no option.** It does not render blank —
  the browser falls back to the FIRST option. The building-type picker read
  "Assembly" while the page showed the office worked example, and nothing about
  the display looked wrong. Any state whose preset is not one of the listed
  types must render its own option: the worked example, edited gains, a share
  link from a build with a different preset list. `tests/buildingPicker.test.tsx`
  guards it.
- **A panel that prints a number and never asked for `units`.** `LocationPanel`
  shipped without the prop at all, so it stayed in Fahrenheit under SI. There is
  no failing conversion to find — the wiring is simply absent, the build is
  green, and the number is still plausible with a unit beside it. Every other
  panel took `units`, which is exactly why nobody looked at this one.
- **An entry field with no unit printed on it.** The sketch box held metres and
  showed `25` to a user reading feet. The missing label is cosmetic; the
  consequence is not. `80 × 60` meant as feet became a 4,800 m² floor — eleven
  times the building drawn — and the verdict followed it without complaint.
  `tests/unitSwitch.test.tsx` asserts the two systems land a factor of 10.76
  apart, because before the fix both returned the same number and *that
  equality was the bug*.
- **Treating storey height as one of the "unitless" box fields.** Storeys and
  WWR carry no unit. Length, width and storey height are all lengths. Converting
  two of the three is worse than converting none: two foot fields beside one
  metre field, all unlabelled.
- **A fixed 800 W arrow reference.** Real values saturate it — the worked
  example's windows term is 4,063 W against a clamp equivalent to 1,840 W, so
  windows and roof render identically despite a 1.5× difference. Derive the
  reference per project, and hold it constant across the 24 hours so scrubbing
  shows the gains genuinely collapsing overnight.

## The phone layout

Under 600 px **of panel width** (a container query, and `COMPACT_BELOW` in
`chart/useWidth.ts` for the JS half), the envelope table becomes cards, the
section drawing swaps its labels for numbered markers, and the 24-hour chart
is drawn at the width it is shown. `docs/design-system.md` has the rules.

Two traps:

- **A box that measures 0 is desktop, not phone.** jsdom reports every width as
  0, and the export's off-screen copy relies on measuring wide. Treating 0 as
  narrow would put every test and every export on the phone path.
- **An export must never be the phone layout.** When the live figure is
  compact, `App.shoot` mounts a desktop copy off screen and shoots that.
  Phone and desktop exports are byte-identical; keep it that way.

## Three generators, and nothing between them typed by hand

```
PNNL_Prototype_Scorecards.xlsx --import:pnnl--> docs/gain-data/*.csv
docs/gain-data/*.csv           --import:gains-> src/model/gainPresets.ts
docs/massings/*.dc.html        --import:massings-> src/model/buildingTypes.ts
```

`gainPresets.ts` and `buildingTypes.ts` are both GENERATED. Do not edit either;
edit the source and re-run. Each importer refuses to write rather than emit
something unciteable, and each prints what it had to decide.

The massing extractor was validated by round-tripping the one massing that was
already in the repo: its nine shell paths came back byte-for-byte identical, and
the ground line and person's head matched. That is the check that made it safe
to trust for the other five.

## Internal gains are generated, not typed

`src/model/gainPresets.ts` is GENERATED from `docs/gain-data/` — do not edit it.
Edit the sheet and run `npm run import:gains`. The importer converts to
canonical SI once and carries each citation through to the field help text, and
it refuses to generate rather than ship an uncited number, a duplicate key, or a
value it cannot parse.

`npm run gains:schedule-sheet` rebuilds sheet 2 against sheet 1's keys, keeping
any row already filled. It seeds the office rows by reading the arrays out of
`schedules.ts`, so the sheet's exemplar cannot drift from the profile the tool
actually runs.

Four things about the current data are worth holding in mind:

1. **Lighting does not come from PNNL.** Those models are the 90.1-2004 vintage,
   whose LPD runs well above current code — office 1.02 against 0.64 W/ft². In a
   tool asking whether a building can need no heating, overstated lighting
   flatters every answer, so lighting comes from the 90.1 Building Area Method
   and everything else from PNNL.
2. **Process zones are excluded** — kitchens, laundries, machine rooms, and any
   zone over 15 W/ft². This tool has no exhaust model and would count a
   99–273 W/ft² kitchen as sensible space heat. Without the rule a Boston
   primary school came out with a **−73 °F balance point** on the strength of
   one 1,808 ft² kitchen.
3. **Two types borrow.** Single Family uses the Mid-rise Apartment model, and
   Laboratory uses Hospital densities on the Medium Office schedule — similar
   benches and plant, ordinary business hours. PNNL publishes neither.
4. **The citations name a document but no edition or table.** The importer
   reports every one of them on each run rather than hiding it. A citation a
   reader cannot look up only half-satisfies the rule it exists for.

The worked example (`SAMPLE_GAINS`, aliased as `BOSTON_GAINS`) is deliberately
NOT a preset. It is the golden-case fixture, and repointing it at the sourced
office row would rewrite the documented 15 deficit hours, 14.7 W/m² and 44.8%
windows lever.

## The section drawing follows the building type

Eighteen types share six massings — a hotel is drawn as multifamily because
guest rooms stack the same way, and Warehouse borrows the single-family shed,
which is the closest shape in the set rather than a likeness. The mapping lives
in `massing` on each preset, so it travels with the data rather than sitting in
the component.

`data-surface` on the canvas and `SurfaceSlot` in the model are the same names
on purpose: that contract is why six massings need no renderer changes between
them, and a test asserts every massing carries all nine slots. A missing slot
would silently drop that surface's arrow rather than fail.

The canvas draws eight anchors — it predates the misc/IT split — so the ninth
and the rack it leaves from are both derived from the equipment glyph, by the
same offset, so the two cannot disagree.

## Where the detail lives

| Question | File |
|---|---|
| What is planned next, and what was deliberately not done | `BACKLOG.md` |
| Every type the engine works in, and why each field exists | `src/model/types.ts` |
| The three Worker settings that fail quietly | `wrangler.jsonc` |
| The palette, both themes, and the contrast correction | `src/ui/tokens.css` |
| Phone layout, breakpoints, touch targets, and why exports ignore them | `docs/design-system.md` |
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

## Why gain edits go through `model/editGains.ts`

Not a convenience layer. It enforces one correctness rule the UI must not be
able to bypass: **the source badge never outlives the number it described.** A
density that came from a standard and has since been typed over is no longer
that standard's value, and keeping the badge on it silently attributes the
user's number to ASHRAE. Every edit drops `preset` to null, and an edited
schedule becomes `custom` even when 23 of its 24 hours still match the preset
it came from.

Two things deliberately do *not* count as edits: switching occupancy between a
density and a headcount (the same statement, said differently), and a no-op
write of the value already there.

φ is in the schema and the engine applies it, but nothing in `editGains` can
move it and no control exists. That is what "in the model, hidden in the UI"
means here.

## PNG export, and the four traps

One camera per exportable figure — the chart and the section are shot
separately, because they are two things someone would send rather than one.

Three traps inherited from a sibling as shipped bugs, and one new:

1. **Resolve `var(--token)` against the LIGHT palette, not the live element.**
   A serialised SVG carries no stylesheet, so every `var()` resolves to nothing
   and `fill` falls back to opaque black. Resolving against the live element is
   the other half of the trap: it exports whichever theme the author was in.
   `resolveTokens` is exported and tested for exactly this.
2. **Pin the clone's width and height**, or the raster takes the viewport.
3. **Fonts** must reach the raster; a system fallback is a different figure.
4. **`feTurbulence` has to survive rasterisation.** Verified in the browser at
   phase 05 rather than assumed at deploy: rasterising the section with and
   without the filter gives 8,296 differing pixels, so the displacement map
   really is applied. Zero black pixels in either, which is the check that trap
   1 held.

The scope statement, the exclusions, the weather attribution and `BRAND.host`
are burned into every export. An exported figure outlives the page that
explained it.

## The weather relay

All the judgement is in `src/climate/relay.ts`. `worker/index.ts` and the Vite
middleware in `vite.config.ts` are both ten-line adapters over it — which is
what makes "the logic running at the edge is the logic exercised locally" true
rather than aspirational. There is no second implementation.

**Why relay at all, when Open-Meteo sends CORS headers?** Three things a direct
browser fetch cannot buy: a CSP with no weather origin in it; an edge cache
shared across everyone asking about the same city; and the derivation running
server-side, so ~1 MB of hourly archive never crosses the wire. Measured: a 1 MB
upstream response becomes a 2 KB design day.

**The CSP is not third-party-free**, despite what the plan claimed before the
first deploy. Cloudflare injects its Web Analytics beacon into the response
itself, from `static.cloudflareinsights.com`, posting back to
`cloudflareinsights.com`. Blocking it did not disable analytics — it made
analytics silently report nothing while logging a CSP error on every page view.
Both are allowed explicitly and they are the only third-party origins in the
policy, which is the same resolution peasestudio.com reached.

**The cache key is coordinates rounded to 2 dp plus the years plus
`DERIVATION_VERSION`.** Rounding (~1.1 km, far finer than ERA5's grid) is what
makes near-identical requests share one upstream call — verified: coordinates
differing in the fourth decimal hit the same entry in 6 ms against 1.65 s cold.
The version segment is the part that is easy to leave out and expensive to miss:
without it, changing the derivation keeps serving results computed by the old
algorithm.

**Host pinning lives in the adapters, not the relay**, so there is exactly one
function in each runtime that can reach the network and it refuses anything that
is not an exact Open-Meteo host over https. Exact, never a suffix —
`open-meteo.com.example.com` ends with the allowed string, and a relay that
fetches whatever URL it is handed is an open proxy on our own domain.

**The tool works with the relay down, structurally.** It boots on the bundled
sample and makes no network call at all until someone searches; a failed search
leaves the loaded design day in place and says so. Verified both ways in the
browser.

## The weather-file path

`epw.ts` and `ddy.ts` are lifted from psychrometric-studio — ours, MIT — and cut
hard. That tool reads dry bulb, humidity and station pressure to compute a
humidity ratio per hour; this one is sensible-only and needs **dry bulb alone**,
so PsychroLib and the altitude handling went with the cut.

Two things that did NOT get cut, because both are real bugs the sibling paid for:

- **EPW's `99.9` is a VALUE, not a blank.** A 99.9 °C hour read as real sits at
  the top of every percentile and drags the design minimum with it.
- **The DDY regex is anchored.** A DDY also contains
  `Ann Htg Wind 99.6% Condns WS=>MCDB`, and a looser match on "Htg 99.6%" picks
  it up and reports a **wind speed as a temperature**. The pattern ends at
  `condns db$` for exactly this, and there is a test with the wind object
  present.

**The DDY supplies the level, the EPW supplies the shape** — deliberately
against the DDY's own convention. The ASHRAE heating design day is *isothermal*:
daily range zero, because equipment is sized against a steady worst case. Used
as drawn it would fail every building by more and for the wrong reason, since a
flat day at the design minimum is colder for 23 hours than any real day is.

**A TMY is one year, not ten.** The real Boston archive yields **six** cold days
inside the +2 K window against the ten-year archive's eighty, so the shape is
much less well supported. The panel says so rather than letting the two paths
look equally solid.

**This is also how the ERA5-versus-published gap got measured** without a
handbook: the DDY carries the published value. Boston Logan is −13.1 °C against
our ERA5 −15.3 °C — a 2.2 K gap, ERA5 colder.

## Copy

Every sentence the tool says is in `src/config/copy.ts`. Components import from
there and nowhere else, so editing the prose never means touching a component —
and `branding.ts` re-exports the scope statements rather than holding a second
copy that could drift.

## Share links

The whole state goes in the URL; there is no store and no project file. Encoding
is compact deliberately: a naive `JSON.stringify` of this state runs past 2,000
characters, which some mail clients wrap and some chat apps truncate — producing
a link that looks fine and is broken. base64url, because `+`, `/` and `=` all
get mangled somewhere along the way.

A link from a future `VERSION` is refused rather than half-read: a plausible
building that is not the one that was sent is worse than an honest failure. Every
malformed input returns null and the caller falls back to the sample.
