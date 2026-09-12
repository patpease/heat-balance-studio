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
 * Hourly loss and gain in W, at a 21.111 °C setpoint with a constant 750 W
 * ground loss, against the committed two-decimal profile.
 *
 * If the engine and this table disagree, one of them is wrong and the test does
 * not care which.
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
