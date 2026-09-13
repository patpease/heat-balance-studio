/**
 * Rebuild docs/gain-data/2-space-type-schedules.csv from sheet 1's keys.
 *
 * Sheet 1 is the register of building types; sheet 2 must follow it or the two
 * cannot be joined. Run this after adding or renaming a type.
 *
 * Existing filled rows are PRESERVED by (space_type, category) — this rewrites
 * the skeleton, it does not discard work.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SHEET_1 = path.join(ROOT, 'docs/gain-data/1-space-type-densities.csv');
const SHEET_2 = path.join(ROOT, 'docs/gain-data/2-space-type-schedules.csv');

const CATEGORIES = ['occupancy', 'lighting', 'misc_equip', 'it_equip'];
const HOURS = Array.from({ length: 24 }, (_, h) => `h${String(h).padStart(2, '0')}`);
const HEADER = ['space_type', 'category', ...HOURS, 'source', 'notes'];

const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const line = (cells) => cells.map((c) => cell(String(c ?? ''))).join(',');

function readRows(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
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

const types = readRows(SHEET_1).slice(1).map((r) => ({ id: r[0], label: r[1] }));

// Keep anything already filled in, keyed by type+category.
const existing = new Map();
for (const row of readRows(SHEET_2).slice(1)) existing.set(`${row[0]}|${row[1]}`, row);

/**
 * Seed the office rows from the schedules the tool ACTUALLY ships.
 *
 * Read out of src/model/schedules.ts rather than retyped, so the exemplar in
 * the sheet cannot drift away from the profile in the code — and so that when
 * the real office schedule arrives, the diff shows exactly what changed.
 */
function shippedOfficeSchedules() {
  const source = fs.readFileSync(path.join(ROOT, 'src/model/schedules.ts'), 'utf8');
  const grab = (constName) => {
    const match = source.match(new RegExp(`export const ${constName} = schedule\\([^]*?\\[([^\\]]*)\\]`));
    if (!match) throw new Error(`could not read ${constName} out of schedules.ts`);
    const values = match[1].split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v));
    if (values.length !== 24) throw new Error(`${constName} parsed to ${values.length} hours, expected 24`);
    return values;
  };
  return {
    occupancy: grab('OFFICE_OCCUPANCY'),
    lighting: grab('OFFICE_LIGHTING'),
    misc_equip: grab('OFFICE_MISC_EQUIPMENT'),
    it_equip: new Array(24).fill(1),
  };
}

const SHIPPED = shippedOfficeSchedules();
const SHIPPED_SOURCE = 'PLACEHOLDER — the profile the tool ships today, not a sourced one';

const IT_NOTE = 'IT runs flat. Change only for a space that genuinely powers down.';
const FLOOR_NOTE = 'Night floor is load-bearing — a zero here flatters the building.';

const out = [line(HEADER)];
let kept = 0;
let seeded = 0;
for (const type of types) {
  for (const category of CATEGORIES) {
    const prior = existing.get(`${type.id}|${category}`);
    // A row with real numbers in it always wins over the seed.
    if (prior && prior.slice(2, 26).some((v) => v.trim() !== '')) { out.push(line(prior)); kept++; continue; }

    const note = category === 'it_equip' ? IT_NOTE : category === 'occupancy' ? 'Weekday, fractions 0–1.' : FLOOR_NOTE;
    if (type.id === 'office') {
      out.push(line([type.id, category, ...SHIPPED[category], SHIPPED_SOURCE, `${note} This is the shape the tool uses for EVERY type today.`]));
      seeded++;
      continue;
    }
    out.push(line([type.id, category, ...new Array(24).fill(''), '', note]));
  }
}

fs.writeFileSync(SHEET_2, out.join('\n') + '\n');
console.log(`Rebuilt sheet 2: ${types.length} types x ${CATEGORIES.length} categories = ${types.length * CATEGORIES.length} rows (${kept} carried over, ${seeded} seeded from the shipped office profile).`);
const orphans = [...existing.keys()].map((k) => k.split('|')[0]).filter((id) => !types.some((t) => t.id === id));
if (orphans.length > 0) {
  console.log(`Dropped ${new Set(orphans).size} type(s) no longer in sheet 1: ${[...new Set(orphans)].join(', ')}`);
}
