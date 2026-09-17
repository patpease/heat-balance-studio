/**
 * The golden case.
 *
 * The project itself lives in `src/model/sampleProject.ts`, because the app
 * opens on it — so the golden test measures the same object the user sees and
 * the two cannot drift apart. This file adds only the expectations, which were
 * computed independently of the engine.
 *
 * A 500 m² single-storey office in Boston, 25 × 20 m, 3.5 m high, 30%
 * window-to-wall, at the default 70 °F setpoint, on the ERA5 design day derived
 * from ten whole years for 42.36 N, 71.06 W.
 *
 * **The profile is in LOCAL STANDARD TIME.** It was an hour later than this
 * until phase 02: Open-Meteo stamps a whole series with whichever UTC offset is
 * in force when the request is made, so a winter record pulled in September came
 * back labelled EDT rather than EST. Correcting it moved the minimum from hour 7
 * to hour 6 and changed the answer.
 */

export {
  SAMPLE_CASE as BOSTON_CASE,
  SAMPLE_CONDITIONS as BOSTON_CONDITIONS,
  SAMPLE_DESIGN_DAY as BOSTON_DESIGN_DAY,
  SAMPLE_ENVELOPE as BOSTON_ENVELOPE,
  SAMPLE_GAINS as BOSTON_GAINS,
  SAMPLE_PROFILE_C as BOSTON_PROFILE_C,
  SAMPLE_SURFACES as BOSTON_SURFACES,
} from '../../src/model/sampleProject';

/**
 * Infiltration, hand-computed, W/K.
 *
 *   above-grade envelope  220.5 walls + 94.5 windows + 500 roof  =  815 m²
 *   grade                 'typical', 0.40 cfm/ft² at 75 Pa
 *   in service            0.40 × 0.112                = 0.0448 cfm/ft²
 *   flow                  0.0448 × 0.005080 × 815     = 0.18548 m³/s
 *   at 6 m elevation      ρ·c_p = 1.2 × 1006 × 0.99929 = 1206.3 J/m³K
 *   conductance           0.185481 × 1206.341         = 223.753 W/K
 *
 * Which is very nearly the whole air-side envelope on its own — 232.5 W/K of
 * walls, windows and roof — and that is not a mistake in the arithmetic. A
 * single-storey 500 m² box has 815 m² of envelope over 1,750 m³ of volume, so
 * a per-area leakage rate buys a lot of air changes: 0.38 ACH here against
 * 0.15 for the four-storey default. Squat buildings leak.
 */
export const EXPECTED_INFILTRATION_W_K = 223.753;

/**
 * Ventilation, hand-computed, W/K.
 *
 *   rate        ASHRAE 62.1 office: 5 cfm/person, 0.06 cfm/ft²
 *   people      27 exactly, by construction of this example
 *   per person  5 × 4.719474e-4 × 27          = 0.063713 m³/s
 *   per area    0.06 × 0.005080 × 500         = 0.152400 m³/s
 *   design flow                                 0.216113 m³/s = 458 cfm
 *   recovery    none, so (1 − η) = 1
 *   at 6 m      × 1206.341                    = 260.706 W/K
 *
 * Which makes the air side of this example 717 W/K: 232.5 of surfaces, 223.8 of
 * leakage and 260.7 of ventilation. Two thirds of the heat leaving the worked
 * example is air the building moves on purpose or fails to keep out, and the
 * walls, windows and roof it was originally written about are the smaller
 * third. That is the whole reason these two terms were the omission worth
 * closing.
 */
export const EXPECTED_VENTILATION_W_K = 260.706;

/**
 * Hourly CONDUCTION loss and gain in W, at a 21.111 °C setpoint with a constant
 * 750 W ground loss, against the committed two-decimal profile.
 *
 * These 24 pairs were computed independently of the engine and they have not
 * been recomputed since. **Infiltration is deliberately not in them.** It
 * arrived after they were written, and folding it in would have meant either
 * 24 new numbers hand-computed again or — far worse — 24 numbers taken from the
 * engine, which is the one thing a golden case must never contain.
 *
 * So the table still holds what it always held, and the test adds infiltration
 * to it by the one hand-computed conductance above. If the engine and this
 * disagree, one of them is wrong and the test does not care which.
 */
export const EXPECTED_HOURLY: readonly { hour: number; loss: number; gain: number }[] = [
  { hour: 0, loss: 8302, gain: 1888 },
  { hour: 1, loss: 8511, gain: 1888 },
  { hour: 2, loss: 8639, gain: 1888 },
  { hour: 3, loss: 8776, gain: 1888 },
  { hour: 4, loss: 8904, gain: 1888 },
  { hour: 5, loss: 9064, gain: 1888 },
  { hour: 6, loss: 9216, gain: 1888 },
  { hour: 7, loss: 9092, gain: 3778 },
  { hour: 8, loss: 8897, gain: 7588 },
  { hour: 9, loss: 8441, gain: 8499 },
  { hour: 10, loss: 7941, gain: 8499 },
  { hour: 11, loss: 7458, gain: 8499 },
  { hour: 12, loss: 7032, gain: 7588 },
  { hour: 13, loss: 6721, gain: 8499 },
  { hour: 14, loss: 6507, gain: 8499 },
  { hour: 15, loss: 6495, gain: 8499 },
  { hour: 16, loss: 6691, gain: 8499 },
  { hour: 17, loss: 7130, gain: 7588 },
  { hour: 18, loss: 7493, gain: 4428 },
  { hour: 19, loss: 7544, gain: 3151 },
  { hour: 20, loss: 7690, gain: 1888 },
  { hour: 21, loss: 7883, gain: 1888 },
  { hour: 22, loss: 8062, gain: 1888 },
  { hour: 23, loss: 8181, gain: 1888 },
];
