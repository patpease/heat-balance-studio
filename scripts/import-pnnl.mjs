/**
 * PNNL prototype scorecards -> docs/gain-data/*.csv
 *
 * Run: npm run import:pnnl -- [path to PNNL_Prototype_Scorecards.xlsx]
 *
 * The workbook is not committed: it is a 1.7 MB binary published by PNNL, and
 * the reviewable artifact is the CSV this produces. Point the script at a local
 * copy to regenerate.
 *
 * FOUR DECISIONS ARE BAKED IN HERE, all of them Patrick's, all of them visible
 * in the citation each number ends up carrying:
 *
 * 1. LIGHTING DOES NOT COME FROM THIS WORKBOOK. Every row in it is the
 *    90.1-2004 vintage, whose LPD runs well above current code — office 1.02
 *    against 0.64 W/ft², multifamily 1.60 against 0.45. In a tool asking
 *    whether a building can need no heating, overstated lighting flatters every
 *    answer. So occupancy, equipment and all three schedules come from PNNL and
 *    lighting comes from the 90.1 Building Area Method table in LIGHTING_W_FT2.
 *
 * 2. PROCESS ZONES ARE EXCLUDED. Patrick's ruling was about restaurant
 *    kitchens — ~99 W/ft² of equipment, most of which leaves through the hood,
 *    which this tool would count as sensible space gain because it has no
 *    exhaust model. The same zones appear in other prototypes and dominate them
 *    just as hard: a primary school's kitchen is 1,808 ft² of a 74,000 ft²
 *    building and 77% of its entire equipment load; a large hotel's kitchen and
 *    laundry are 75% of its. Applying the ruling only to restaurants would have
 *    left a Boston primary school with a balance point of −73 °F — a school that
 *    never needs heating, on the strength of one kitchen. So the rule is
 *    extended by density as well as by name, and every excluded zone is printed
 *    on each run.
 *
 * 3. IT IS NOT IN THIS WORKBOOK. "Electric Equipment" is plug and process
 *    combined, with no IT split and no IT schedule, so all of it lands in misc
 *    and IT stays "none" — the user adds it from the separate IT picker.
 *
 * 4. PLENUMS ARE NOT FLOOR AREA. They are flagged Conditioned=Yes and carry a
 *    blank lighting cell. Including them halves a prototype's weighted density.
 */

import fs from 'node:fs';
import path from 'node:path';

import { openWorkbook } from './lib/xlsx.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs/gain-data');
const WORKBOOK = process.argv[2] ?? '/Users/patrickpease/Projects/Temp/PNNL_Prototype_Scorecards.xlsx';

const SOURCE_PNNL = 'PNNL prototype scorecards, 90.1-2004 models';
const SOURCE_LPD = 'ASHRAE 90.1 Building Area Method';
const SOURCE_PERSON = 'ASHRAE Handbook Fundamentals';
const SOURCE_IT = 'No published default exists — pick an IT space type or enter a value';

/** W/ft². Deliberately NOT from the workbook — see decision 1. */
const LIGHTING_W_FT2 = {
  office: 0.64, retail: 0.84, school: 0.72, healthcare: 0.81,
  hotel: 0.56, warehouse: 0.45, restaurant: 0.8, residential: 0.45,
  laboratory: 0.91,
};
/** Btu/h sensible per person. Also not in the workbook. */
const PERSON_BTU_H = { seated: 200, active: 250 };

/**
 * The tool's building types, and where each one's numbers come from.
 *
 * `proto` supplies the densities; `schedProto` supplies the schedules when they
 * should come from a different building. Two types borrow:
 *
 *   Single Family  — Mid-rise Apartment wholesale. PNNL publishes no
 *                    single-family model.
 *   Laboratory     — Hospital densities on the Medium Office schedule. A lab
 *                    carries hospital-like equipment but keeps business hours,
 *                    and PNNL publishes no laboratory prototype at all.
 *
 * `massing` names the section drawing this type is shown with. Six drawings
 * cover seventeen types, so most are shared; Warehouse borrows the
 * single-family shed, which is the closest shape in the set rather than a good
 * likeness.
 */
const TYPES = [
  { id: 'office-small', label: 'Small Office', proto: 'OfficeSmall', lpd: 'office', person: 'seated', massing: 'office' },
  { id: 'office-medium', label: 'Medium Office', proto: 'OfficeMedium', lpd: 'office', person: 'seated', massing: 'office' },
  { id: 'office-large', label: 'Large Office', proto: 'OfficeLarge', lpd: 'office', person: 'seated', massing: 'office' },
  { id: 'retail-standalone', label: 'Standalone Retail', proto: 'RetailStandalone', lpd: 'retail', person: 'seated', massing: 'civic' },
  { id: 'retail-stripmall', label: 'Strip Mall', proto: 'RetailStripmall', lpd: 'retail', person: 'seated', massing: 'civic' },
  { id: 'school-primary', label: 'Primary School', proto: 'SchoolPrimary', lpd: 'school', person: 'seated', massing: 'school' },
  { id: 'school-secondary', label: 'Secondary School', proto: 'SchoolSecondary', lpd: 'school', person: 'seated', massing: 'school' },
  { id: 'healthcare-outpatient', label: 'Outpatient Healthcare', proto: 'OutPatientHealthCare', lpd: 'healthcare', person: 'seated', massing: 'office' },
  { id: 'hospital', label: 'Hospital', proto: 'Hospital', lpd: 'healthcare', person: 'seated', massing: 'lab' },
  { id: 'laboratory', label: 'Laboratory', proto: 'Hospital', schedProto: 'OfficeMedium', lpd: 'laboratory', person: 'seated', massing: 'lab',
    note: 'Hospital equipment on an office schedule: similar benches and plant, ordinary business hours. PNNL publishes no laboratory prototype.' },
  { id: 'hotel-small', label: 'Small Hotel', proto: 'HotelSmall', lpd: 'hotel', person: 'seated', massing: 'multifamily' },
  { id: 'hotel-large', label: 'Large Hotel', proto: 'HotelLarge', lpd: 'hotel', person: 'seated', massing: 'multifamily' },
  { id: 'warehouse', label: 'Warehouse', proto: 'Warehouse', lpd: 'warehouse', person: 'active', massing: 'home',
    note: 'Drawn with the single-family shed: the closest shape in the massing set, not a likeness.' },
  { id: 'restaurant-quick', label: 'Quick Service Restaurant', proto: 'RestaurantFastFood', lpd: 'restaurant', person: 'active', massing: 'civic' },
  { id: 'restaurant-full', label: 'Full Service Restaurant', proto: 'RestaurantSitDown', lpd: 'restaurant', person: 'active', massing: 'civic' },
  { id: 'apartment-midrise', label: 'Mid-rise Apartment', proto: 'ApartmentMidRise', lpd: 'residential', person: 'seated', massing: 'multifamily' },
  { id: 'apartment-highrise', label: 'High-rise Apartment', proto: 'ApartmentHighRise', lpd: 'residential', person: 'seated', massing: 'multifamily' },
  { id: 'residential-single', label: 'Single Family Home', proto: 'ApartmentMidRise', lpd: 'residential', person: 'seated', massing: 'home',
    note: 'Uses the Mid-rise Apartment prototype: PNNL publishes no single-family model.' },
];

// --- Zones -----------------------------------------------------------------

const wb = openWorkbook(WORKBOOK);
const zoneSheet = wb.rows('Zone and HVAC System Summary');
const ZH = zoneSheet[0].map(String);
const zcol = (name) => {
  const i = ZH.findIndex((h) => h.trim() === name);
  if (i < 0) throw new Error(`Zone sheet has no column "${name}"`);
  return i;
};
const Z = {
  proto: zcol('Prototype Building (raw_data)'), zone: zcol('Thermal Zone'),
  area: zcol('Area [ft2]'), mult: zcol('Multipliers'), cond: zcol('Conditioned'),
  lpd: zcol('Lighting Power Desnity [W/ft2]'),
  occ: zcol('Design Occupancy Density [people/1,000 ft2]'),
  epd: zcol('Electric Equipment [W/ft2]'),
};

const SUMMARY_ROW = /^(conditioned |unconditioned )?total$/i;

/** Named process spaces: their load is cooking or washing, not space heat. */
const PROCESS_NAME = /kitchen|laundry/i;
/**
 * W/ft² above which a zone is process rather than occupied space.
 *
 * 15 is chosen to sit above the densest real rooms in the set — a hospital
 * X-ray suite at 10.0 and an operating room at 11.0 both stay in — and below
 * the machine rooms: an elevator pump room at 155.6 and every kitchen.
 */
const PROCESS_W_FT2 = 15;

const zones = [];
for (const r of zoneSheet.slice(1)) {
  const proto = String(r[Z.proto] ?? '').trim();
  const zone = String(r[Z.zone] ?? '').trim();
  if (!proto || SUMMARY_ROW.test(zone)) continue;
  if (String(r[Z.cond] ?? '').trim().toLowerCase() !== 'yes') continue;
  if (typeof r[Z.lpd] !== 'number') continue; // plenum — decision 4
  const area = (Number(r[Z.area]) || 0) * (Number(r[Z.mult]) || 1);
  if (area <= 0) continue;
  zones.push({ proto, zone, area, occPer1000: Number(r[Z.occ]) || 0, epd: Number(r[Z.epd]) || 0 });
}

const excluded = [];
const isProcess = (z) => PROCESS_NAME.test(z.zone) || z.epd > PROCESS_W_FT2;
for (const z of zones) if (isProcess(z)) excluded.push(z);

/** Decision 2: a preset describes the occupied space, not the back of house. */
const zonesFor = (proto) => zones.filter((z) => z.proto === proto && !isProcess(z));

// --- Schedules -------------------------------------------------------------

const WANT = { Occupants: 'occupancy', Lighting: 'lighting', 'Electric Equipment': 'misc_equip' };
const WEEKDAY = new Set(['Mon - Fri', 'Mon - Thu']);
/** A winter design day: school is in session, not away on summer holiday. */
const OUT_OF_SESSION = /summer|holiday|vacation/i;

/** The model's zone names and the scorecard's space types are written by
 *  different people. Only spelling gaps survive word-prefix matching. */
const ALIAS = [
  [/\bpatient\s*rm\b/gi, 'patroom'],
  [/\bphysical\s*therapy\b/gi, 'phystherapy'],
  [/\bdinning\b/gi, 'dining'],
];
const applyAlias = (s) => ALIAS.reduce((t, [re, to]) => t.replace(re, to), String(s));
const words = (s) => applyAlias(s).toLowerCase().split(/[^a-z]+/i).map((w) => w.replace(/s$/, '')).filter((w) => w.length > 1);
const flat = (s) => applyAlias(s).toLowerCase().replace(/[^a-z]/g, '');
const akin = (a, b) => a.startsWith(b) || b.startsWith(a);

function parseSpaceType(raw) {
  const exceptFlat = [...String(raw).matchAll(/\(\s*except\s+([^)]+)\)/gi)]
    .flatMap((m) => m[1].split(',')).map(flat).filter(Boolean);
  const bare = String(raw).replace(/\([^)]*\)/g, ' ').trim();
  const all = /^all$/i.test(bare);
  const others = /^others?$/i.test(bare);
  return { exceptFlat, all, others, words: all || others ? [] : words(bare) };
}

function score(zoneName, spec) {
  const zw = words(zoneName);
  const zf = flat(zoneName);
  // "All (Except Perimeter_mid_ZN_2)" names ONE zone. Matching it word by word
  // excluded every PERIMETER zone and left Small Office with no occupancy
  // schedule at all, so the exception is matched whole.
  if (spec.exceptFlat.some((e) => zf.includes(e) || e.includes(zf))) return -1;
  if (spec.all) return 0.5;
  if (spec.others) return 0;
  // REARSTAIRSFLR1 and GUESTROOM101 carry no separators, so word splitting
  // yields one long token; substring on the flattened name catches those, with
  // a length floor so "room" cannot match half the building.
  return spec.words.filter((w) => zw.some((z) => akin(z, w)) || (w.length >= 5 && zf.includes(w))).length;
}

const scheduleSheet = wb.rows('Schedule Summary').slice(1);
const coverage = [];

function scheduleFor(proto, sheetName) {
  let variants = scheduleSheet.filter((r) => r[0] === proto && r[1] === sheetName && WEEKDAY.has(String(r[3])));
  if (variants.length === 0) return null;
  const inSession = variants.filter((v) => !OUT_OF_SESSION.test(String(v[2])));
  if (inSession.length > 0 && inSession.length < variants.length) variants = inSession;

  const specs = variants.map((v) => ({ raw: String(v[2]), spec: parseSpaceType(v[2]), hours: v.slice(4, 28).map((x) => Number(x) || 0) }));
  const residual = specs.filter((s) => s.spec.others);
  const named = specs.filter((s) => !s.spec.others);

  const zs = zonesFor(proto);
  const total = zs.reduce((s, z) => s + z.area, 0);
  const acc = new Array(24).fill(0);
  let covered = 0;
  const unmatched = [];

  for (const zone of zs) {
    const scored = named.map((s) => ({ s, n: score(zone.zone, s.spec) })).filter((x) => x.n > 0);
    const best = Math.max(0, ...scored.map((x) => x.n));
    const hits = best > 0 ? scored.filter((x) => x.n === best).map((x) => x.s) : residual;
    if (hits.length === 0) { unmatched.push(zone.zone); continue; }
    covered += zone.area;
    // A zone two variants claim equally splits its area between them, which
    // averages the apartment "Stay Home"/"Working" pair rather than picking.
    const share = zone.area / hits.length;
    for (const hit of hits) for (let h = 0; h < 24; h++) acc[h] += hit.hours[h] * share;
  }

  if (covered === 0) {
    // Nothing joined. Strip Mall's variants are "Type 1/2/3 Store" — a tenant
    // mix, and which of the ten units is which type is not in this workbook. An
    // equal average is the honest reading, and it is reported as a fallback
    // rather than passed off as area-weighted.
    const mean = new Array(24).fill(0);
    for (const s of specs) for (let h = 0; h < 24; h++) mean[h] += s.hours[h] / specs.length;
    coverage.push({ proto, sheetName, coverage: 0, basis: 'equal average of variants', unmatched: [] });
    return mean.map((v) => Math.min(1, Math.max(0, v)));
  }
  coverage.push({ proto, sheetName, coverage: covered / total, basis: 'area-weighted', unmatched: [...new Set(unmatched)] });
  return acc.map((v) => Math.min(1, Math.max(0, v / covered)));
}

// --- Write the sheets ------------------------------------------------------

const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const line = (cells) => cells.map(cell).join(',');
const round = (v, places) => Number(v.toFixed(places));

const densityHeader = ['space_type', 'label', 'massing', 'occupancy_ft2_per_person', 'people_sensible_btu_h',
  'lighting_w_per_ft2', 'misc_equip_w_per_ft2', 'it_equip_w_per_ft2', 'source_occupancy',
  'source_people_sensible', 'source_lighting', 'source_misc_equip', 'source_it_equip', 'notes'];
const densityRows = [line(densityHeader)];

const HOURS = Array.from({ length: 24 }, (_, h) => `h${String(h).padStart(2, '0')}`);
const scheduleRows = [line(['space_type', 'category', ...HOURS, 'source', 'notes'])];

const problems = [];

for (const type of TYPES) {
  const zs = zonesFor(type.proto);
  if (zs.length === 0) { problems.push(`${type.id}: no conditioned zones for prototype ${type.proto}`); continue; }
  const area = zs.reduce((s, z) => s + z.area, 0);
  const people = zs.reduce((s, z) => s + (z.occPer1000 / 1000) * z.area, 0);
  const epd = zs.reduce((s, z) => s + z.epd * z.area, 0) / area;
  if (people <= 0) problems.push(`${type.id}: prototype ${type.proto} has no occupants`);

  const kitchenNote = /^Restaurant/.test(type.proto) ? ' Dining zone only: the kitchen is excluded because this tool has no exhaust model.' : '';
  densityRows.push(line([
    type.id, type.label, type.massing,
    Math.round(area / people), PERSON_BTU_H[type.person],
    LIGHTING_W_FT2[type.lpd], round(epd, 3), 0,
    `${SOURCE_PNNL} (${type.proto})`, SOURCE_PERSON, SOURCE_LPD, `${SOURCE_PNNL} (${type.proto})`, SOURCE_IT,
    `${type.note ?? ''}${kitchenNote}`.trim(),
  ]));

  const schedProto = type.schedProto ?? type.proto;
  for (const [sheetName, category] of Object.entries(WANT)) {
    const hours = scheduleFor(schedProto, sheetName);
    if (!hours) { problems.push(`${type.id}: no ${sheetName} schedule for ${schedProto}`); continue; }
    scheduleRows.push(line([type.id, category, ...hours.map((h) => round(h, 4)),
      `${SOURCE_PNNL} (${schedProto})`, type.note ?? '']));
  }
  // IT has no schedule in the workbook and runs flat by definition.
  scheduleRows.push(line([type.id, 'it_equip', ...new Array(24).fill(1),
    'Flat by definition — IT does not follow a building schedule', '']));
}

if (problems.length > 0) {
  console.error('Refusing to write. Problems:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

fs.writeFileSync(path.join(OUT_DIR, '1-space-type-densities.csv'), densityRows.join('\n') + '\n');
fs.writeFileSync(path.join(OUT_DIR, '2-space-type-schedules.csv'), scheduleRows.join('\n') + '\n');

console.log(`Wrote ${TYPES.length} building types and ${scheduleRows.length - 1} schedule rows.`);
if (excluded.length) {
  console.log(`\n${excluded.length} process zone(s) excluded — cooking and machine loads this tool would`);
  console.log('otherwise count as sensible space heat, having no exhaust model:');
  for (const z of excluded.sort((a, b) => b.epd - a.epd)) {
    console.log(`  ${z.proto.padEnd(22)} ${z.zone.padEnd(26)} ${z.epd.toFixed(1).padStart(6)} W/ft²  ${Math.round(z.area).toLocaleString('en-US').padStart(7)} ft²`);
  }
}
const weak = coverage.filter((c) => c.basis === 'area-weighted' && c.coverage < 0.999);
const averaged = coverage.filter((c) => c.basis !== 'area-weighted');
if (averaged.length) {
  console.log(`\n${averaged.length} schedule(s) fell back to an equal average — no zone name joined a variant:`);
  for (const c of averaged) console.log(`  ${c.proto}/${c.sheetName}`);
}
if (weak.length) {
  console.log(`\n${weak.length} schedule(s) cover less than the whole floor plate. The missing zones carry no`);
  console.log('row in the scorecard, so the profile describes the area that does:');
  for (const c of weak) console.log(`  ${c.proto}/${c.sheetName}: ${(c.coverage * 100).toFixed(1)}% — ${c.unmatched.slice(0, 4).join(', ')}${c.unmatched.length > 4 ? ` +${c.unmatched.length - 4}` : ''}`);
}
