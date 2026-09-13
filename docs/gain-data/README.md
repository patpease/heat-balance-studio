# Internal gain data

**Both CSVs in this folder are generated. Do not hand-edit them.**

```bash
npm run import:pnnl     # PNNL_Prototype_Scorecards.xlsx -> the two CSVs here
npm run import:gains    # the two CSVs -> src/model/gainPresets.ts
```

`import:pnnl` takes the workbook path as an argument and defaults to
`/Users/patrickpease/Projects/Temp/PNNL_Prototype_Scorecards.xlsx`. The workbook
itself is **not committed** — it is a 1.7 MB binary published by PNNL, and the
reviewable artifact is the CSV it produces.

## What comes from where

| Quantity | Source |
|---|---|
| occupancy density | PNNL prototype, area-weighted over conditioned zones |
| equipment density | PNNL prototype, area-weighted, process zones excluded |
| all four schedules | PNNL prototype, weekday, area-weighted across space types |
| **lighting** | **ASHRAE 90.1 Building Area Method — deliberately not PNNL** |
| sensible heat per person | ASHRAE Handbook Fundamentals |
| IT equipment | none; the user adds it from the IT picker |

## The five decisions baked into the importer

Each one is visible in the citation the number ends up carrying, and each is
printed on every run so it cannot quietly drift.

**1. Lighting does not come from the workbook.** Every row in it is the
90.1-2004 vintage, whose LPD runs well above current code — office 1.02 against
0.64 W/ft², multifamily 1.60 against 0.45. In a tool asking whether a building
can need no heating, overstated lighting flatters every answer, so lighting
comes from the Building Area Method table in the importer instead.

**2. Process zones are excluded.** A kitchen carries 99–273 W/ft² of equipment,
most of which leaves through the hood. This tool has no exhaust model and would
count all of it as sensible space gain. The rule is a name match on
kitchen/laundry plus a 15 W/ft² ceiling, which also catches an elevator pump
room at 155.6 and the Large Office data-centre zones. Twelve zones are excluded
and the run prints every one. Without this a Boston primary school comes out
with a balance point of **−73 °F** on the strength of one 1,808 ft² kitchen.

**3. IT is not in the workbook.** "Electric Equipment" is plug and process
combined, with no IT split and no IT schedule, so all of it lands in misc and IT
stays "none" for every type.

**4. Plenums are not floor area.** They are flagged `Conditioned=Yes` and carry
a blank lighting cell. Counting them halves a prototype's weighted density —
Medium Office came out at 0.51 W/ft², below present-day code, which was the
tell.

**5. Weekday only.** The source publishes Saturday and Sunday profiles too. A
heating design day is the cold weekday.

## How a schedule is built

One prototype has several schedule variants, named for space types
("Guest Rooms", "Others", "All (Except Perimeter_mid_ZN_2)"). The importer joins
those names to the model's thermal zones and area-weights the result:

- **"Others" is the residual** — it takes whatever no named variant claimed.
- Summer-holiday variants are dropped; a heating design day has school in
  session.
- A zone two variants claim equally splits its area between them, which averages
  the apartment "Stay Home"/"Working" pair rather than picking one.
- Matching is word-prefix on both sides (`class`/`classroom`, `guest`/
  `GUESTROOM101`) with a substring fallback for zone names written without
  separators (`REARSTAIRSFLR1`). Two spelling aliases are needed:
  `Patient Rm` → `PATROOM`, `Physical Therapy` → `PHYSTHERAPY`.

Seven schedules cover less than the whole floor plate because the missing zones
carry no row in the scorecard at all — Large Office's perimeter-mid zones have
no occupancy row, hospital corridors have no equipment row. The profile then
describes the area that does have one, and the run prints the coverage.

## The two borrowed types

PNNL publishes no single-family and no laboratory model.

- **Single Family Home** takes Mid-rise Apartment wholesale.
- **Laboratory** takes Hospital densities on the Medium Office schedule: similar
  benches and plant, ordinary business hours. Its lighting is the Building Area
  Method laboratory value (0.91 W/ft²), not the healthcare one.

## Known gap

The 90.1 citations name a document but no edition or table, so a reader cannot
look those numbers up. `import:gains` reports them on every run.
