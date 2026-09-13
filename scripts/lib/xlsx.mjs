/**
 * Just enough of xlsx to read the PNNL scorecards.
 *
 * A .xlsx is a zip of XML. Rather than take a dependency for one build-time
 * script, this shells out to `unzip -p` and reads the two parts that matter:
 * the shared string table and a worksheet. No formulas, no styles, no dates —
 * the scorecards carry plain numbers and text.
 */

import { execFileSync } from 'node:child_process';

const part = (workbook, name) =>
  execFileSync('unzip', ['-p', workbook, name], { maxBuffer: 256 * 1024 * 1024 }).toString('utf8');

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
   .replace(/&amp;/g, '&');

function colIndex(ref) {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/)[0]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function openWorkbook(file) {
  const strings = [];
  for (const si of part(file, 'xl/sharedStrings.xml').split('<si>').slice(1)) {
    const body = si.slice(0, si.indexOf('</si>'));
    let text = '';
    for (const m of body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += m[1];
    strings.push(decode(text));
  }

  const rels = part(file, 'xl/_rels/workbook.xml.rels');
  const wb = part(file, 'xl/workbook.xml');
  const target = {};
  for (const m of rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) target[m[1]] = m[2].replace(/^\/?xl\//, '');
  const sheets = {};
  for (const m of wb.matchAll(/<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"/g)) sheets[decode(m[1])] = target[m[2]];

  return {
    sheetNames: Object.keys(sheets),
    rows(sheetName) {
      const path = sheets[sheetName];
      if (!path) throw new Error(`no sheet named "${sheetName}" — have: ${Object.keys(sheets).join(', ')}`);
      const xml = part(file, `xl/${path}`);
      const rows = [];
      for (const r of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells = [];
        for (const c of r[2].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
          const ref = c[1].match(/r="([A-Z]+\d+)"/)?.[1];
          const type = c[1].match(/t="([^"]+)"/)?.[1];
          let value;
          if (type === 'inlineStr') value = decode((c[2].match(/<t[^>]*>([\s\S]*?)<\/t>/) ?? [, ''])[1]);
          else {
            const v = c[2].match(/<v>([\s\S]*?)<\/v>/)?.[1];
            if (v === undefined) value = '';
            else if (type === 's') value = strings[Number(v)] ?? '';
            else if (type === 'str' || type === 'e') value = decode(v);
            else value = Number(v);
          }
          if (ref) cells[colIndex(ref)] = value;
        }
        rows[Number(r[1]) - 1] = cells;
      }
      return rows.map((r) => Array.from({ length: r?.length ?? 0 }, (_, i) => r?.[i] ?? ''));
    },
  };
}
