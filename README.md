# Heat Balance Studio

**Can this building be designed to need no heating at all?**

An early-stage design screen, not a certification tool. Enter five envelope
surfaces and your internal gains, pick a US city, and see hour by hour whether
the heat a building makes covers the heat it loses on a cold design day.

Part of [Pease Studio](https://peasestudio.com) — free, lightweight tools for
building performance. Everything runs in your browser. No account, no upload,
nothing kept.

## What it does

- **Envelope loss** — walls, windows, roof, ground floor and exposed floor,
  each with an area and a U-value (or an R-value; the field converts).
- **Internal gains** — people, lighting, misc equipment and IT equipment, each
  with an editable density and a 24-hour schedule.
- **A derived design day** — type a city and state and it pulls ten years of
  hourly weather, takes the coldest 0.4% of hours for the design minimum, and
  builds the day's shape from the average of the cold days in the record.
- **A 24-hour balance** — loss against gain, every hour, with the worst hour
  flagged and the Passive House 10 W/m² load shown for context.
- **Balance-point temperature** and **wall-to-floor ratio** as headline metrics.

## What it deliberately does not do

- **Sensible heat only.** No latent load, no humidity.
- **No ventilation or infiltration.** The largest single omission, and it means
  a passing result is optimistic.
- **No solar gain**, and **no thermal mass** — steady state, hour by hour.
- It is a theoretical screen built on historic weather data. **It does not
  replace a formal heat loss calculation performed to ASHRAE standards.**

## Development

```bash
npm install
npm run dev              # http://localhost:5185
npm test
npm run preview:worker   # the real Workers runtime, with the real CSP
```

See `CLAUDE.md` for the rules the code is built on and the mistakes already
paid for.

## Credits

Weather data © [Open-Meteo](https://open-meteo.com/) (ERA5), CC BY 4.0.

MIT licensed.
