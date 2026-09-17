/**
 * The massing canvas -> src/model/buildingTypes.ts
 *
 * Run: npm run import:massings
 *
 * Six section drawings, extracted rather than retyped, so a re-export of the
 * canvas drops straight in. The canvas is committed alongside this script
 * because it is 38 KB of text and the provenance of every path below.
 *
 * The markup is regular, and that regularity IS the classifier:
 *
 *   rect  fill=url(#hb-soil)                 -> soil
 *   path  stroke=#78848C width=2.2           -> the ground line
 *   g     stroke=#D8DEE3   (the shell group) -> shell / floor-line / aperture,
 *                                               told apart by stroke-width
 *   g     stroke=#55C0A5 fill=none           -> glyphs, plus the person's head
 *   g     data-surface=...                   -> the eight arrow anchors
 *
 * `data-surface` in the canvas and `SurfaceSlot` in the model are the same
 * names on purpose: that is the contract that lets one renderer drive any
 * massing. The canvas predates the misc/IT split, so it draws eight anchors and
 * the ninth — gain-it-equipment — is added here.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CANVAS = path.join(ROOT, 'docs/massings/building-massings.dc.html');
const OUT = path.join(ROOT, 'src/model/buildingTypes.ts');

/** Canvas label -> the model's BuildingTypeId. */
const IDS = {
  'Office building section': { id: 'office', label: 'Office' },
  'School building section': { id: 'school', label: 'School' },
  'Laboratory building section': { id: 'lab', label: 'Laboratory' },
  'Civic building section': { id: 'civic', label: 'Civic' },
  'Multi-family building section': { id: 'multifamily', label: 'Multi-family' },
  'Single-family home section': { id: 'home', label: 'Single-family home' },
};

const html = fs.readFileSync(CANVAS, 'utf8');
const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];

const IT_OFFSET = 68;
/**
 * SHAFT_LENGTH x MAX_SCALE from src/chart/arrowScale.ts, plus the head.
 *
 * The head scales with the stroke now, so the longest arrow also wears the
 * biggest one and reaches a little further than the shaft alone.
 */
const ARROW_REACH = 88 * 2.3 + 34;
/**
 * Room for a label at the arrow START, running outward from the building.
 *
 * This was 130 when labels were parked past the arrowhead. They sit against the
 * building now, so the crop only has to hold the text itself — but it has to
 * hold ALL of it. The longest is "MISC EQUIPMENT": 14 characters of IBM Plex
 * Mono at 13 px, whose advance is 0.6 em, plus 1.4 of tracking each — about
 * 129 units, and the halo stroke adds 5 on either side.
 */
const LABEL_WIDTH = 140;
const LABEL_HEIGHT = 42;

/**
 * The three slots that leave the building vertically, re-aimed to 45°.
 *
 * A roof arrow straight up and two floor arrows straight down made the crop
 * 236 units taller at each end than it had to be, and the drawing is sized by
 * the panel's WIDTH — so every unit of height it did not need came straight off
 * how big it could be drawn. At 45° the same arrow reaches 167 units up instead
 * of 236, and the width it borrows in exchange is free: the ground line already
 * runs the full canvas, so nothing an arrow does horizontally widens the crop.
 */
const DIAGONAL_SLOTS = new Set(['loss-roof', 'loss-ground-floor', 'loss-exposed-floor']);

/**
 * Which way a re-aimed arrow leans.
 *
 * Where the canvas already chose a horizontal side, keep it — the civic and
 * home roofs are pitched and their arrows were drawn leaving the slope at -64°
 * and -62°, so they already lean right and should keep leaning right. Only the
 * arrows drawn dead vertical have no side to preserve, and those take the side
 * of the building they sit on, which is what keeps the two floor arrows from
 * meeting under the middle of the slab.
 *
 * Deriving it rather than tabulating it per slot is the lesson from the labels:
 * a table keyed on the slot looked right on the office and was wrong on the
 * school, which mirrors it.
 */
function diagonal(anchor, centreX) {
  const radians = (anchor.rotate * Math.PI) / 180;
  const cos = Math.cos(radians);
  const up = Math.sin(radians) < 0;
  const right = Math.abs(cos) > 0.05 ? cos > 0 : anchor.x >= centreX;
  return up ? (right ? -45 : -135) : (right ? 45 : 135);
}

/**
 * Shift a path in x. Absolute M/L/C/Z only — anything else returns null and the
 * caller skips, rather than silently emitting a mangled shape.
 */
function shiftX(d, dx) {
  if (/[HhVvAaSsQqTtmlcz]/.test(d.replace(/[Ee]-?\d/g, ''))) return null;
  let index = 0;
  return d.replace(/-?\d*\.?\d+/g, (n) => (index++ % 2 === 0 ? String(Number(n) + dx) : n));
}

/** Every coordinate in a path's `d`, control points included. Over-estimates a
 *  curve's extent, which is the safe direction: a crop never clips. */
function points(d) {
  const nums = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
  const out = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

function extract(label) {
  const svg = html.match(new RegExp(`<svg[^>]*aria-label="${label}"[\\s\\S]*?</svg>`))?.[0];
  if (!svg) throw new Error(`no massing labelled "${label}"`);

  const soil = [...svg.matchAll(/<rect[^>]*>/g)]
    .filter((r) => (attr(r[0], 'fill') ?? '').includes('hb-soil'))
    .map((r) => ({ x: +attr(r[0], 'x'), y: +attr(r[0], 'y'), width: +attr(r[0], 'width'), height: +attr(r[0], 'height') }));

  const groundLine = [...svg.matchAll(/<path[^>]*>/g)]
    .find((p) => attr(p[0], 'stroke') === '#78848C')?.[0];
  if (!groundLine) throw new Error(`${label}: no ground line`);

  const groupBody = (openTag) => {
    const start = svg.indexOf(openTag);
    if (start < 0) throw new Error(`${label}: no group ${openTag}`);
    // These groups contain no nested <g>, so the first close is the right one.
    return svg.slice(start + openTag.length, svg.indexOf('</g>', start));
  };

  const shellGroup = groupBody('<g stroke="#D8DEE3" stroke-width="2.8" fill="#2C3238" fill-opacity="0.7">');
  const shell = [...shellGroup.matchAll(/<path[^>]*>/g)].map((p) => {
    const width = attr(p[0], 'stroke-width');
    const role = width === '1.4' ? 'floor-line' : width === '2.4' ? 'aperture' : 'shell';
    return { d: attr(p[0], 'd'), role };
  });

  const glyphGroup = groupBody('<g stroke="#55C0A5" fill="none" stroke-width="2.2">');
  const glyphs = [...glyphGroup.matchAll(/<path[^>]*>/g)].map((p) => ({
    d: attr(p[0], 'd'),
    role: attr(p[0], 'stroke-width') === '1.4' ? 'glyph-light' : 'glyph',
  }));
  const head = glyphGroup.match(/<circle[^>]*>/)?.[0];
  if (!head) throw new Error(`${label}: no person's head`);
  const personHead = { cx: +attr(head, 'cx'), cy: +attr(head, 'cy'), r: +attr(head, 'r') };

  const anchors = [...svg.matchAll(/<g id="[^"]*" data-surface="([^"]+)" transform="translate\(([-\d.]+),([-\d.]+)\)(?: rotate\(([-\d.]+)\))?"/g)]
    .map((m) => ({ slot: m[1] === 'gain-equipment' ? 'gain-misc-equipment' : m[1], x: +m[2], y: +m[3], rotate: +(m[4] ?? 0) }));
  if (anchors.length !== 8) throw new Error(`${label}: expected 8 anchors on the canvas, found ${anchors.length}`);

  // The ninth. The canvas predates the misc/IT split, so the IT arrow is placed
  // beside the equipment one and points the same way — at the hour the verdict
  // is decided it is usually the only gain arrow still drawn. The rack it leaves
  // from is the equipment glyph shifted by the same offset, so the two always
  // agree even though neither is on the canvas.
  const misc = anchors.find((a) => a.slot === 'gain-misc-equipment');
  if (!misc) throw new Error(`${label}: no equipment anchor to hang IT beside`);
  anchors.push({ slot: 'gain-it-equipment', x: misc.x + IT_OFFSET, y: misc.y, rotate: misc.rotate });

  const nearestToEquipment = glyphs
    .filter((g) => g.role === 'glyph' && shiftX(g.d, 0) !== null)
    .map((g) => {
      const pts = points(g.d);
      const cx = pts.reduce((t, q) => t + q[0], 0) / pts.length;
      const cy = pts.reduce((t, q) => t + q[1], 0) / pts.length;
      return { g, pts, distance: Math.hypot(cx - misc.x, cy - misc.y) };
    })
    .sort((a, b) => a.distance - b.distance)[0];

  if (nearestToEquipment) {
    const rack = shiftX(nearestToEquipment.g.d, IT_OFFSET);
    glyphs.push({ d: rack, role: 'glyph' });
    // Three shelves, inset into the shifted box, so a rack reads as a rack.
    const xs2 = nearestToEquipment.pts.map((q) => q[0] + IT_OFFSET);
    const ys2 = nearestToEquipment.pts.map((q) => q[1]);
    const x0 = Math.min(...xs2), x1 = Math.max(...xs2);
    const y0 = Math.min(...ys2), y1 = Math.max(...ys2);
    const inset = (x1 - x0) * 0.18, step = (y1 - y0) / 4;
    const round1 = (n) => Math.round(n * 10) / 10;
    glyphs.push({
      d: [1, 2, 3].map((i) => `M${round1(x0 + inset)} ${round1(y0 + step * i)} L ${round1(x1 - inset * (i === 2 ? 2 : 1))} ${round1(y0 + step * i)}`).join(' '),
      role: 'glyph-light',
    });
  }

  // Crop to the drawing. Soil is excluded deliberately: it runs to the bottom of
  // the canvas and framing to it would shrink every building to a smudge.
  const body = [
    ...shell.flatMap((p) => points(p.d)),
    ...glyphs.flatMap((p) => points(p.d)),
    ...points(attr(groundLine, 'd')),
    [personHead.cx - personHead.r, personHead.cy - personHead.r],
    [personHead.cx + personHead.r, personHead.cy + personHead.r],
  ];

  // The tenth anchor, and the second one the canvas does not draw: infiltration
  // arrived after the massings did. It leaves from the top-left shoulder of the
  // shell, up and away — stack effect pushes warm air out at the top, which is
  // the mechanism, and the top-left is the one quadrant the canvas left empty on
  // every massing. The roof arrow leans right on all six, so the two do not
  // meet.
  {
    const shellPoints = shell.flatMap((p) => points(p.d));
    const minX = Math.min(...shellPoints.map((p) => p[0]));
    const minY = Math.min(...shellPoints.map((p) => p[1]));
    anchors.push({ slot: 'loss-infiltration', x: minX + 40, y: minY + 22, rotate: -135 });
    // Ventilation runs parallel and below it. The two are the building's air
    // terms — one it fails to keep out, one it moves on purpose — and they read
    // as a pair, which is what they are. Parallel rather than crossing, and far
    // enough apart that the labels clear each other.
    anchors.push({ slot: 'loss-ventilation', x: minX + 40, y: minY + 70, rotate: -135 });
  }

  // Re-aim the vertical arrows before cropping, so the crop sees where they
  // actually go.
  const bodyXs = body.map((p) => p[0]);
  const centreX = (Math.min(...bodyXs) + Math.max(...bodyXs)) / 2;
  for (const a of anchors) if (DIAGONAL_SLOTS.has(a.slot)) a.rotate = diagonal(a, centreX);

  const all = [
    ...body,
    // An arrow reaches SHAFT_LENGTH x MAX_SCALE = 202 units from its anchor
    // plus its head, and a label sits at the START with its text running
    // outward. Reserving that in EVERY direction — which is what this did — put
    // 236 units of nothing above a floor arrow and below a roof one. The
    // direction is in the data, so spend the room where the arrow actually
    // goes and spend only label width on the rest.
    ...anchors.flatMap((a) => {
      const radians = (a.rotate * Math.PI) / 180;
      return [
        [a.x + ARROW_REACH * Math.cos(radians), a.y + ARROW_REACH * Math.sin(radians)],
        [a.x - LABEL_WIDTH, a.y - LABEL_HEIGHT],
        [a.x + LABEL_WIDTH, a.y + LABEL_HEIGHT],
      ];
    }),
  ];
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const pad = 14;
  const minX = Math.floor(Math.min(...xs)) - pad, maxX = Math.ceil(Math.max(...xs)) + pad;
  const minY = Math.floor(Math.min(...ys)) - pad, maxY = Math.ceil(Math.max(...ys)) + pad;

  return {
    ...IDS[label],
    viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
    shell, glyphs, soil, anchors,
    groundLine: attr(groundLine, 'd'),
    personHead,
  };
}

const massings = Object.keys(IDS).map(extract);

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const pathList = (list) => list.map((p) => `  { d: ${q(p.d)}, role: ${q(p.role)} },`).join('\n');
const CONST = (m) => m.id.toUpperCase().replace(/-/g, '_');

const file = `/**
 * Building types, as DATA.
 *
 * GENERATED by scripts/import-massings.mjs from docs/massings/. Do not edit by
 * hand — re-export the canvas and re-run \`npm run import:massings\`.
 *
 * The section drawing is never inline JSX. A \`BuildingType\` holds the massing
 * paths, the ground, the occupant glyphs and one anchor per arrow slot, and
 * \`SectionDrawing\` renders whichever record it is handed.
 *
 * \`data-surface\` in the canvas and \`SurfaceSlot\` here are the same names on
 * purpose. That is the contract between the drawing and the engine, and it is
 * why six massings need no renderer changes between them.
 */

import type { ArrowAnchor, BuildingType, BuildingTypeId, MassingPath } from './types';

${massings.map((m) => `const ${CONST(m)}_SHELL: MassingPath[] = [
${pathList(m.shell)}
];

const ${CONST(m)}_GLYPHS: MassingPath[] = [
${pathList(m.glyphs)}
];

const ${CONST(m)}_ANCHORS: ArrowAnchor[] = [
${m.anchors.map((a) => `  { slot: ${q(a.slot)}, x: ${a.x}, y: ${a.y}, rotate: ${a.rotate} },`).join('\n')}
];

export const ${CONST(m)}: BuildingType = {
  id: ${q(m.id)},
  label: ${q(m.label)},
  viewBox: ${q(m.viewBox)},
  shell: ${CONST(m)}_SHELL,
  glyphs: ${CONST(m)}_GLYPHS,
  soil: [
${m.soil.map((s) => `    { x: ${s.x}, y: ${s.y}, width: ${s.width}, height: ${s.height} },`).join('\n')}
  ],
  anchors: ${CONST(m)}_ANCHORS,
};
`).join('\n')}
/** The ground line, per massing. */
export const GROUND_LINES: Record<BuildingTypeId, string> = {
${massings.map((m) => `  ${m.id.includes('-') ? q(m.id) : m.id}: ${q(m.groundLine)},`).join('\n')}
};

/** A person's head, which the glyph path deliberately leaves out. */
export const PERSON_HEADS: Record<BuildingTypeId, { cx: number; cy: number; r: number }> = {
${massings.map((m) => `  ${m.id.includes('-') ? q(m.id) : m.id}: { cx: ${m.personHead.cx}, cy: ${m.personHead.cy}, r: ${m.personHead.r} },`).join('\n')}
};

export const BUILDING_TYPES: readonly BuildingType[] = Object.freeze([
${massings.map((m) => `  ${CONST(m)},`).join('\n')}
]);

export function buildingType(id: BuildingTypeId): BuildingType {
  return BUILDING_TYPES.find((t) => t.id === id) ?? OFFICE;
}
`;

fs.writeFileSync(OUT, file);
console.log(`Wrote ${massings.length} massings.`);
for (const m of massings) {
  console.log(`  ${m.id.padEnd(12)} shell=${String(m.shell.length).padStart(2)} glyphs=${String(m.glyphs.length).padStart(2)} anchors=${m.anchors.length} viewBox="${m.viewBox}"`);
}
