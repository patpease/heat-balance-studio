# Test fixtures

## `boston-2015-2024.i16`

Ten whole calendar years of hourly dry-bulb temperature for **42.3601 N,
71.0589 W** (Boston, Massachusetts), 2015-01-01 to 2024-12-31 inclusive —
87,672 values in **local standard time** (UTC−5, no daylight saving), packed as
temperature × 100 in little-endian `Int16`. That packing round-trips exactly at
the source's own precision.

**Source: ERA5 via [Open-Meteo](https://open-meteo.com/), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).** Redistributed here
under that licence, unmodified except for the local-time shift and the integer
packing described above.

### Why it is committed

The derivation in `src/climate/designDay.ts` is the tool's most consequential
piece of judgement, and a test that needs a live API call is a test that
silently stops running. This file lets phases 01 and 02 be verified offline and
forever.

It is also in **local standard time on purpose**. Open-Meteo stamps a whole
response with whichever UTC offset is in force when the request is made, not
whichever applied on the data's own date — so a winter record pulled in summer
comes back labelled an hour late. This fixture has that correction already
applied, which is why `designDay.test.ts` can assert exact values.

Regenerate with `src/climate/openMeteo.ts`'s `archiveUrl` at `timezone=UTC`,
then shift by `standardOffsetSeconds('America/New_York')`.
