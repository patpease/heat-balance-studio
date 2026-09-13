# Internal gain data templates

Three sheets. Open each in Excel, fill what you can, leave the rest blank.
**A blank imports as "no default", never as zero.**

## What the tool needs

For each hour `h` of the design day the engine computes:

```
Q_gain(h) = f_occ(h)·N·q_p  +  f_lgt(h)·LPD·A  +  f_misc(h)·MPD·A  +  f_IT(h)·IPD·φ·A
```

| Sheet | Supplies |
|---|---|
| `1-space-type-densities.csv` | the densities — `N` via occupancy density, `q_p`, `LPD`, `MPD` |
| `2-space-type-schedules.csv` | the four hourly fraction rows `f(h)`, per space type |
| `3-it-equipment-types.csv` | `IPD` and `φ`, which cannot be looked up the way the others can |

## Units — fill in what the column headers name, not SI

The tool stores canonical SI and converts at the display edge, so the import
does the conversion. Collect in the units the source standard publishes:

| Quantity | Collect in |
|---|---|
| occupancy | ft² per person |
| people | Btu/h **sensible** per person — sensible only, no latent |
| lighting | W/ft² |
| misc equipment | W/ft² |
| IT equipment | W/ft² of **building** area (sheet 3 derives it from room area) |

## Source columns are not optional

Every density gets a citation naming edition and table — `ASHRAE 90.1-2022
Table 9.5.1`, `ASHRAE Fundamentals 2021 Ch.18 Table 1`. A number badged with a
standard's name that has not been checked against the standard is worse than no
default. **Rows still marked UNVERIFIED will not ship.**

This is the whole point of the exercise: the preset is currently called
"Office (provisional)" and every field's help text says so. That name changes
only when these sheets come back.

## Sheet 1 — one row per space type

The `office-open` row is filled so the format is unambiguous. Those numbers are
**my placeholders, not sourced values**, and need replacing along with their
source cells. Every other row is blank. Add or delete rows freely; `space_type`
is the key and must stay unique.

For reference, the placeholder row is what ships today, converted from the SI in
`src/model/defaults.ts` — 18.6 m²/person, 75 W/person, 6.5 W/m², 7.0 W/m².

One exception: the `it_equip` cell on that row carries the **worked example's**
1.0 W/m², not the shipped default. IT ships at **zero** by design — see sheet 3.

## Sheet 2 — four rows per space type, one per category

Fractions 0–1, weekday. Two things worth holding to:

- **The overnight floor decides the answer.** The verdict is usually settled
  between 04:00 and 07:00, so a lighting or equipment row that drops to zero at
  night flatters every building the tool will ever see.
- **`it_equip` stays flat at 1** unless the space genuinely powers its IT down.

## Sheet 3 — IT equipment

IT is the one row with no 90.1 equivalent, because 90.1 does not split
receptacle load into IT and misc. It also spans three orders of magnitude: an
IDF closet is a fraction of a W/ft² of building area, a data hall is hundreds of
W/ft² of white space. So it is collected as intensity-of-IT-room × share of
building, and the tool ships `none` rather than a number that would look
authoritative and be wrong most of the time.

`φ` is the fraction of IT power released into the **conditioned space**. A data
hall on its own cooling system rejects its heat outdoors and warms nothing;
counting it as space heat is the likeliest way this row gets misused. v1 holds
φ at 1.0 and shows no control, so the value collected here matters from v2 on.

## When you send them back

**There is no importer yet** — the earlier note in this file claimed the build
had one, and that was wrong. Writing it is a small job once the real column
shapes are known, and it will generate `src/model/defaults.ts` with the
citations carried through to the field help text so the tool can show where each
number came from. Ask for it when the sheets are ready and it gets written
against the actual data rather than against a guess at it.
