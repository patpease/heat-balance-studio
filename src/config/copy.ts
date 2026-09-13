/**
 * Every sentence the tool says, in one place.
 *
 * **This is a DRAFT for Patrick to edit.** It is written from the plan's own
 * language rather than invented, so the register should already be close — but
 * the wording is mine and the wording is his call. Edit the strings here; the
 * components read from this file and nothing else.
 *
 * Three rules the copy follows, all of them settled decisions rather than
 * style preferences:
 *
 *  1. **The verdict points forward.** The tool exists to make someone want to
 *     chase a self-heating building and show them where to push — not to
 *     certify that they got there. A sentence that points forward cannot be
 *     screenshotted as a pass.
 *  2. **Never the bare phrase "heating-free".** It is true of the envelope with
 *     the air changes switched off, and it is the sentence people screenshot.
 *  3. **A number badged with a standard's name must be cited.** Where a default
 *     is not yet sourced, the copy says "provisional" rather than implying it.
 */

/** Where I am least confident, and would most like your eye. */
export const DRAFT_NOTES = [
  'TAGLINE — the plan opens with this question, so it is the obvious tagline, but it may read as too long for a card.',
  'ASSUMPTIONS — now twelve. The panel shows three and hides the rest; worth checking the three shown are still the three that bite now that the data provenance ones exist.',
  'CARD_LONG — written for the site\'s tool detail page; I have not seen how ZEEL\'s reads, so the length may be off.',
] as const;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const NAME = 'Heat Balance Studio';

/** The question the tool answers. Used as the tagline and as the page lede. */
export const TAGLINE = 'Can this building be designed to need no heating at all?';

/** One sentence, for the tools index on peasestudio.com. */
export const CARD_SHORT =
  'An early-stage screen that asks whether a building makes enough heat to cover what it loses.';

/** The tool detail page. Longer, but still not a brochure. */
export const CARD_LONG =
  'Pick a building type and a US city, enter five envelope surfaces, and see hour by hour whether the ' +
  'heat a building makes covers the heat it loses on a cold design day. Eighteen types carry their own ' +
  'occupancy, lighting, equipment and schedules from the PNNL prototype models, and every one of them ' +
  'stays editable. It is a screen for the stage where the massing is still moving — not a load ' +
  'calculation, and not a certification path. Everything runs in your browser: no account, no upload, ' +
  'nothing kept.';

// ---------------------------------------------------------------------------
// The framing block
// ---------------------------------------------------------------------------

/**
 * Where the gain numbers come from, shown under the building-type picker.
 *
 * The lighting exception is stated because it is the one place the tool
 * deliberately departs from its own source, and a user comparing against the
 * PNNL models would otherwise find the difference and not know why.
 */
export const GAINS_SOURCE_NOTE =
  'Densities and all four schedules are the PNNL prototype for this building type, weekday profiles. ' +
  'Lighting is the exception — those models are the 90.1-2004 vintage, so lighting comes from the 90.1 ' +
  'Building Area Method instead.';

/**
 * The standing statement. Permanent page furniture and burned into every
 * export, not a tooltip.
 */
export const SCOPE_STATEMENT =
  'A theoretical screen built on historic weather data. It does not replace a formal heat loss ' +
  'calculation performed to ASHRAE standards.';

export const EXCLUSIONS_STATEMENT =
  'Envelope-only, sensible-heat screen. Ventilation and infiltration are not counted, so a passing ' +
  'result is optimistic.';

export const WEATHER_ATTRIBUTION = 'Weather data © Open-Meteo (ERA5), CC BY 4.0.';

// ---------------------------------------------------------------------------
// What it does and does not do
// ---------------------------------------------------------------------------

export const WHAT_IT_DOES = [
  'Five envelope surfaces — walls, windows, roof, ground floor, exposed floor — each with an area and a U-value.',
  'Four internal gains — people, lighting, misc equipment, IT equipment — each with its own 24-hour schedule.',
  'A design day derived from ten years of hourly weather: the coldest 0.4% of hours sets the minimum, the average of the cold days in the record sets the shape.',
  'An hourly balance for all 24 hours, with the worst hour flagged.',
  'Balance-point temperature and wall-to-floor ratio as headline metrics.',
] as const;

/**
 * The stated assumptions.
 *
 * These belong in the interface, not in a docs folder. An assumption the user
 * cannot see is the one most likely to be argued with after the fact — and
 * three of these are things the user cannot change, which makes saying them the
 * only honest option.
 */
export const ASSUMPTIONS = [
  'Sensible heat only. No latent load, no humidity.',
  'No ventilation or infiltration. The largest single omission, and the reason a passing result is optimistic.',
  'No solar gain. Leaving it out is conservative; leaving ventilation out is not. They do not cancel, and the optimistic one is larger in almost every case.',
  'Steady state, hour by hour. No thermal mass, so no coasting overnight on stored heat — a heavyweight building is penalised here relative to reality.',
  'One zone, one setpoint. No stratification, no distribution loss.',
  'U-values are assembly averages including thermal bridges. The tool has no bridge model, so that is your job.',
  'Every surface faces outdoor air or the ground. A wall to an unheated garage has to be entered as an outdoor wall, which overstates its loss.',
  'All IT heat reaches the space. A separately-cooled server room that rejects its heat outdoors is counted here as if it warmed the building.',
  'Floor area is gross conditioned area — every per-area figure the tool reports is divided by it, and it is the more generous of the conventions in use.',
  'Gains come from the PNNL prototype models, which are the 90.1-2004 vintage. Their lighting runs well above current code, so this tool takes lighting from the 90.1 Building Area Method and everything else from the prototypes.',
  'Kitchens, laundries and machine rooms are left out of the equipment density. Their load is cooking and washing, most of which leaves through an exhaust hood, and this tool has no exhaust to send it up.',
  'Schedules are weekday profiles. A heating design day is a cold weekday, so the weekend profiles the source publishes are not used.',
] as const;

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

export const VERDICT = {
  /** `${shortfall} ${unit}` at `${hour}`. */
  short: (shortfall: string, unit: string, hour: string) =>
    `Not self-heating yet — ${shortfall} ${unit} short at ${hour}.`,

  clear: (margin: string, unit: string, hour: string) =>
    `Self-heating right through this design day, with ${margin} ${unit} in hand at ${hour}.`,

  /** The lever. Computed from the worst hour's largest loss term. */
  leverShort: (term: string, share: number) =>
    `${term} is ${share}% of the loss at that hour — that is where the gap closes fastest.`,

  leverClear: (term: string, share: number) =>
    `${term} is ${share}% of the loss at that hour; that margin is where ventilation will come out of.`,
} as const;

export const BALANCE_POINT_NOTE =
  'The outdoor temperature below which this building needs heat. Lower is better. A scheduled building ' +
  'has a band rather than a point, and the spread is the finding: self-heating at lunchtime, nowhere ' +
  'near it before dawn.';

export const WALL_TO_FLOOR_NOTE =
  'Gross exterior wall, including glazing, over conditioned floor area. Low is good — more floor making ' +
  'heat per unit of wall losing it, which is the whole argument in one number.';

// ---------------------------------------------------------------------------
// Field help
// ---------------------------------------------------------------------------

export const HELP = {
  uValue:
    'Assembly average including thermal bridges — the tool has no bridge model, so the allowance is yours to make.',
  groundFloor:
    'Driven by a constant ground temperature, not by outdoor air. 55 °F is the rule of thumb; beyond 3 K from the site’s annual mean the tool uses the site’s own figure instead and says so.',
  exposedFloor: 'A floor over outside air — a cantilever, or the soffit over an undercroft. Usually none.',
  people: 'Sensible heat only. The latent half of a person’s output is not part of this balance.',
  lighting: 'Installed lighting power density. All of it becomes heat in the space.',
  miscEquipment:
    'Laptops, workstations, printers, fridges, AV. Follows occupancy with a standby floor that does not drop to zero.',
  itEquipment:
    '24/7 loads: server rooms, IDF and telecom closets, data halls. These run at full power overnight, which is when this tool’s verdict is usually decided. No published default exists — 90.1 does not separate receptacle load, and real values span three orders of magnitude.',
  schedule:
    'Drag a bar to edit, or use the arrow keys. The overnight floor decides the answer: a row that drops to zero at night flatters every building.',
  sketchBox:
    'Five dimensions instead of five areas, for when you have a massing in mind rather than a takeoff. Everything it fills in stays editable.',
  weatherFile:
    'A .ddy beside the .epw supplies the published ASHRAE minimum; the shape still comes from the file’s own cold days, because the ASHRAE heating design day is flat. Read in your browser — nothing is uploaded.',
  geocoder:
    'Pick the right one — the geocoder ranks by relevance but does not filter by state, so the second and third results are sometimes nowhere near.',
  buildingType:
    'Sets all four densities and all four schedules at once, from that type\u2019s PNNL prototype. The schedules are the half that moves the answer: an apartment sits near full occupancy at 05:00 where an office sits at zero, and the verdict is decided between 04:00 and 07:00. Everything it fills in stays editable — change any number and the badge drops, because it is no longer that model\u2019s value.',
} as const;

// ---------------------------------------------------------------------------
// Things that go wrong
// ---------------------------------------------------------------------------

export const ERRORS = {
  relayDown: 'Could not reach the weather service. The design day already loaded is still in use.',
  rateLimited:
    'The weather service is rate-limiting requests just now. Try again shortly, or drop in an EPW file.',
  noMatch: (query: string) => `No US place matched “${query}”. Try adding the state.`,
  notAWeatherFile: 'Drop an .epw file, or the whole .zip a weather download comes in.',
  noEpwInZip: 'No .epw inside this archive. A Climate.OneBuilding download carries one alongside the .ddy.',
  thinRecord: (coldDays: number) =>
    `Only ${coldDays} cold days in this file were close enough to the design minimum to shape the day — ` +
    'a typical year holds far fewer than a ten-year record, so the shape is less well supported than a ' +
    'searched location’s.',
} as const;

// ---------------------------------------------------------------------------
// For peasestudio.com
// ---------------------------------------------------------------------------

/**
 * The tool record for the site's curated index. Copy this across when the tool
 * ships; the figure is the section drawing's own PNG export, not a screenshot.
 */
export const SITE_RECORD = {
  title: NAME,
  tagline: TAGLINE,
  summary: CARD_SHORT,
  description: CARD_LONG,
  status: 'Beta',
  topics: ['Early-stage design', 'Envelope', 'Heating', 'Passive design'],
  /** One line of plain language, for the featured treatment. */
  plainLanguage:
    'Some buildings make enough heat on their own to get through a cold day without a boiler. This works out whether yours might.',
} as const;
