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

  return {
    id: r.space_type,
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
 * **The schedules are NOT from this data.** Sheet 2 has not come back yet, so
 * every preset below runs on the office profile, and \`SCHEDULES_ARE_PROVISIONAL\`
 * says so on the page. That matters more than it sounds: this tool's verdict is
 * decided between 04:00 and 07:00, so the overnight floor of a schedule moves
 * the answer more than the density it scales. A warehouse on an office lighting
 * profile is wrong in a way a user cannot see.
 */

export interface PresetDensity {
  /** Canonical SI. Null means the sheet left it blank: no default, not zero. */
  readonly value: number | null;
  readonly citation: string;
}

export interface GainPreset {
  readonly id: string;
  readonly label: string;
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

/**
 * True while the presets below borrow the office schedule. The UI renders a
 * line saying so; delete this flag when sheet 2 lands and the schedules become
 * per-type.
 */
export const SCHEDULES_ARE_PROVISIONAL = true;

export const GAIN_PRESETS: readonly GainPreset[] = Object.freeze([
${presets.map((p) => `  {
    id: ${q(p.id)},
    label: ${q(p.label)},
    areaPerPerson: ${density(p.areaPerPerson)},
    sensiblePerPerson: ${density(p.sensiblePerPerson)},
    lighting: ${density(p.lighting)},
    miscEquipment: ${density(p.miscEquipment)},
    itEquipment: ${density(p.itEquipment)},
    notes: ${q(p.notes)},
  },`).join('\n')}
]);

/** The one the tool opens on. */
export const DEFAULT_PRESET_ID = 'office';

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
