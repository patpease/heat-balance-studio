/**
 * Turn docs/gain-data/*.csv into src/model/gainPresets.ts.
 *
 * Run: npm run import:gains
 *
 * The sheets are the source of truth for every internal-gain default. This
 * script exists so that regenerating them is a command rather than a careful
 * afternoon of retyping, and so the CITATIONS travel with the numbers into the
 * field help text — a number badged with a standard's name that a reader cannot
 * look up is the thing this project refuses to ship.
 *
 * Conversion happens HERE, once. The sheets are collected in the units the
 * standards publish (ft²/person, Btu/h, W/ft²); everything downstream is
 * canonical SI.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SHEET_1 = path.join(ROOT, 'docs/gain-data/1-space-type-densities.csv');
const SHEET_2 = path.join(ROOT, 'docs/gain-data/2-space-type-schedules.csv');
const OUT = path.join(ROOT, 'src/model/gainPresets.ts');

// Exact-by-definition, matching src/model/units.ts.
const SQFT_PER_SQM = 10.7639104;
const BTU_H_PER_WATT = 3.412141633;

/** Minimal RFC4180 reader. Quoted fields may contain commas. */
function parseCsv(text) {
  const rows = [];
  let field = '', row = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

function toRecords(rows) {
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? '').trim()])));
}

const problems = [];
const notes = [];

/**
 * A blank cell is "no default", NOT zero.
 *
 * These are different claims: zero asserts the load is absent, blank admits we
 * do not know. Twelve of the thirteen IT cells are blank, and rendering those
 * as a confident 0 W/ft² would be the tool making a claim the sheet does not.
 */
function number(record, column, { required }) {
  const raw = record[column];
  if (raw === '') {
    if (required) problems.push(`${record.space_type}: ${column} is blank and has no fallback`);
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    problems.push(`${record.space_type}: ${column} is "${raw}", which is not a usable number`);
    return null;
  }
  return value;
}

function citation(record, column, { value, fallback }) {
  const raw = (record[column] ?? '').trim();
  if (value === null) return fallback;
  if (raw === '') {
    problems.push(`${record.space_type}: ${column} is empty but a value was given — an uncited number does not ship`);
    return 'UNCITED';
  }
  if (/^UNVERIFIED/i.test(raw)) {
    problems.push(`${record.space_type}: ${column} is still UNVERIFIED`);
  }
  // A citation naming a document but no edition or table cannot actually be
  // looked up. Not fatal — it is what the sheet says — but it is reported.
  if (!/\b(19|20)\d{2}\b/.test(raw) && !/table|section|chapter|ch\./i.test(raw)) {
    notes.push(`${record.space_type}: "${raw}" names no edition or table`);
  }
  return raw;
}

/**
 * Sheet 2: four 24-hour rows per building type.
 *
 * The overnight floor is the load-bearing part of every one of these. This
 * tool's verdict is decided between 04:00 and 07:00, so a lighting or equipment
 * row that drops to zero at night flatters the building more than any density
 * error would. A row of 24 zeroes is therefore reported, not accepted quietly.
 */
/** The section drawings that exist. A type must name one of these. */
const MASSINGS = new Set(["office", "school", "lab", "civic", "multifamily", "home"]);

const CATEGORIES = { occupancy: 'occupancy', lighting: 'lighting', misc_equip: 'miscEquipment', it_equip: 'itEquipment' };

function readSchedules() {
  const byType = new Map();
  for (const row of toRecords(parseCsv(fs.readFileSync(SHEET_2, 'utf8')))) {
    const field = CATEGORIES[row.category];
    if (!field) { problems.push(`schedules: unknown category "${row.category}" for ${row.space_type}`); continue; }
    const hours = Array.from({ length: 24 }, (_, h) => row[`h${String(h).padStart(2, '0')}`]);
    if (hours.some((v) => v === '' || v === undefined)) { problems.push(`${row.space_type}/${row.category}: not all 24 hours are filled`); continue; }
    const values = hours.map(Number);
    if (values.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) { problems.push(`${row.space_type}/${row.category}: fractions must be 0-1`); continue; }
    if (values.every((v) => v === 0)) notes.push(`${row.space_type}/${row.category} is zero for all 24 hours`);
    if (!byType.has(row.space_type)) byType.set(row.space_type, {});
    byType.get(row.space_type)[field] = { values, source: row.source ?? '' };
  }
  return byType;
}

const schedulesByType = readSchedules();
const records = toRecords(parseCsv(fs.readFileSync(SHEET_1, 'utf8')));
const seen = new Set();

const presets = records.map((r) => {
  if (seen.has(r.space_type)) problems.push(`duplicate space_type "${r.space_type}"`);
  seen.add(r.space_type);
  if (!r.label) problems.push(`${r.space_type}: no label, and the label is what the picker shows`);

  const areaPerPersonFt2 = number(r, 'occupancy_ft2_per_person', { required: true });
  const sensibleBtu = number(r, 'people_sensible_btu_h', { required: true });
  const lightingWFt2 = number(r, 'lighting_w_per_ft2', { required: true });
  const miscWFt2 = number(r, 'misc_equip_w_per_ft2', { required: true });
  const itWFt2 = number(r, 'it_equip_w_per_ft2', { required: false });

  const NO_IT = 'No published default exists — pick an IT space type or enter a value';

  const schedules = schedulesByType.get(r.space_type);
  for (const field of Object.values(CATEGORIES)) {
    if (!schedules?.[field]) problems.push(`${r.space_type}: sheet 2 has no ${field} schedule`);
  }

  const massing = (r.massing ?? "").trim();
  if (!MASSINGS.has(massing)) problems.push(`${r.space_type}: massing "${massing}" is not one of ${[...MASSINGS].join(", ")}`);

  return {
    id: r.space_type,
    massing,
    schedules,
    label: r.label,
    areaPerPerson: {
      value: areaPerPersonFt2 === null ? null : areaPerPersonFt2 / SQFT_PER_SQM,
      citation: citation(r, 'source_occupancy', { value: areaPerPersonFt2, fallback: NO_IT }),
    },
    sensiblePerPerson: {
      value: sensibleBtu === null ? null : sensibleBtu / BTU_H_PER_WATT,
      citation: citation(r, 'source_people_sensible', { value: sensibleBtu, fallback: NO_IT }),
    },
    lighting: {
      value: lightingWFt2 === null ? null : lightingWFt2 * SQFT_PER_SQM,
      citation: citation(r, 'source_lighting', { value: lightingWFt2, fallback: NO_IT }),
    },
    miscEquipment: {
      value: miscWFt2 === null ? null : miscWFt2 * SQFT_PER_SQM,
      citation: citation(r, 'source_misc_equip', { value: miscWFt2, fallback: NO_IT }),
    },
    // Blank stays zero in the model — the engine needs a number — but carries
    // the "no published default" citation rather than a standard's name.
    itEquipment: {
      value: itWFt2 === null ? 0 : itWFt2 * SQFT_PER_SQM,
      citation: itWFt2 === null || itWFt2 === 0 ? NO_IT : citation(r, 'source_it_equip', { value: itWFt2, fallback: NO_IT }),
    },
    notes: r.notes ?? '',
  };
});

if (problems.length > 0) {
  console.error('Refusing to generate. The sheet has problems:\n');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const q = (s) => JSON.stringify(s);
const density = (d) => `{ value: ${d.value === null ? 'null' : Number(d.value.toFixed(6))}, citation: ${q(d.citation)} }`;
const sched = (s) => `{ values: [${s.values.join(', ')}], source: ${q(s.source)} }`;
const schedules = (p) => Object.values(CATEGORIES)
  .map((field) => `      ${field}: ${sched(p.schedules[field])},`).join('\n');

const file = `/**
 * Internal-gain presets, one per building type.
 *
 * GENERATED by scripts/import-gain-data.mjs from docs/gain-data/. Do not edit
 * by hand — edit the sheet and re-run \`npm run import:gains\`.
 *
 * Values are canonical SI: m² per person, W per person (sensible), W/m².
 * The sheet is collected in IP because that is what the standards publish;
 * the conversion happens once, in the importer.
 *
 * Each preset carries its own four 24-hour weekday profiles. That matters more
 * than the densities do: the verdict is decided between 04:00 and 07:00, so a
 * schedule's overnight floor moves the answer more than the density it scales.
 * An apartment sits near full occupancy at 05:00 where an office sits at zero,
 * and no density can express that.
 *
 * WEEKDAY ONLY. The source publishes Saturday and Sunday profiles too; a
 * heating design day is the cold weekday, so those are not imported.
 */

import type { BuildingTypeId } from './types';

export interface PresetDensity {
  /** Canonical SI. Null means the sheet left it blank: no default, not zero. */
  readonly value: number | null;
  readonly citation: string;
}

export interface PresetSchedule {
  /** Exactly 24, each 0-1. Hour 0 is 00:00-01:00 local standard time. */
  readonly values: readonly number[];
  readonly source: string;
}

export interface PresetSchedules {
  readonly occupancy: PresetSchedule;
  readonly lighting: PresetSchedule;
  readonly miscEquipment: PresetSchedule;
  readonly itEquipment: PresetSchedule;
}

export interface GainPreset {
  readonly id: string;
  readonly label: string;
  /** Which section drawing this type is shown with. Six cover eighteen types. */
  readonly massing: BuildingTypeId;
  readonly schedules: PresetSchedules;
  /** m² per person. */
  readonly areaPerPerson: PresetDensity;
  /** W per person, sensible only. */
  readonly sensiblePerPerson: PresetDensity;
  /** W/m². */
  readonly lighting: PresetDensity;
  /** W/m². */
  readonly miscEquipment: PresetDensity;
  /** W/m². Zero where the sheet was blank — see the note in the importer. */
  readonly itEquipment: PresetDensity;
  readonly notes: string;
}

export const GAIN_PRESETS: readonly GainPreset[] = Object.freeze([
${presets.map((p) => `  {
    id: ${q(p.id)},
    label: ${q(p.label)},
    massing: ${q(p.massing)},
    schedules: {
${schedules(p)}
    },
    areaPerPerson: ${density(p.areaPerPerson)},
    sensiblePerPerson: ${density(p.sensiblePerPerson)},
    lighting: ${density(p.lighting)},
    miscEquipment: ${density(p.miscEquipment)},
    itEquipment: ${density(p.itEquipment)},
    notes: ${q(p.notes)},
  },`).join('\n')}
]);

/** The one the tool opens on. */
export const DEFAULT_PRESET_ID = 'office-medium';

export function presetById(id: string): GainPreset | undefined {
  return GAIN_PRESETS.find((p) => p.id === id);
}
`;

fs.writeFileSync(OUT, file);
console.log(`Wrote ${path.relative(ROOT, OUT)} — ${presets.length} presets.`);
if (notes.length > 0) {
  console.log(`\n${notes.length} citation(s) name no edition or table, so a reader cannot look the number up:`);
  for (const n of [...new Set(notes)]) console.log(`  - ${n}`);
}
