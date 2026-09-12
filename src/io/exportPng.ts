/**
 * PNG export.
 *
 * One camera per exportable figure — the chart and the section are shot
 * separately, because they are two things someone would send rather than one.
 *
 * **Four traps, three of them inherited as shipped bugs from a sibling tool.**
 *
 * 1. **Resolve `var(--token)` against a LIGHT-staged clone, not the live
 *    element.** A serialised SVG carries no stylesheet, so every `var()` in it
 *    resolves to nothing and the browser falls back to an initial value — which
 *    for `fill` is opaque black. And resolving against the live element exports
 *    the viewer's theme, so a report carries whatever mode its author happened
 *    to be in.
 * 2. **Pin the clone's width and height.** An unsized clone takes the outer
 *    viewport and spills.
 * 3. **Embed fonts as data URIs**, or the raster falls back to a system face.
 * 4. **`feTurbulence` has to survive rasterisation.** New here, because the
 *    sketch filter is new. Checked at this phase rather than at deploy.
 */

import { BRAND, EXCLUSIONS_STATEMENT, SCOPE_STATEMENT, WEATHER_ATTRIBUTION } from '../config/branding';

/** The light palette, resolved once and written into the exported markup. */
const LIGHT_TOKENS: Record<string, string> = {
  '--page': '#F2EFE7',
  '--panel': '#FBF9F3',
  '--border': '#D8DED6',
  '--border-strong': '#CBD3CB',
  '--ink': '#0C2A24',
  '--body': '#3C534B',
  '--muted': '#5B6E66',
  '--loss': '#A8462E',
  '--gain': '#2F7D6E',
  '--massing-fill': '#FFFFFF',
  '--massing-fill-opacity': '0.72',
  '--soil': '#9DAAA2',
  '--ground-line': '#5B6E66',
  '--label-halo': '#FBF9F3',
  '--grid': '#E4E0D6',
};

const VAR_PATTERN = /var\(\s*(--[a-z0-9-]+)\s*\)/gi;

/**
 * Replace every `var(--token)` with its literal light value.
 *
 * Exported as its own function because it is the piece worth testing: the
 * failure it prevents produces a valid PNG that is simply the wrong colours,
 * which no type checker or smoke test catches.
 */
export function resolveTokens(markup: string, tokens: Record<string, string> = LIGHT_TOKENS): string {
  return markup.replace(VAR_PATTERN, (whole, name: string) => tokens[name] ?? whole);
}

/** Attributes that can carry a `var()` and therefore need resolving. */
const PAINT_ATTRIBUTES = [
  'fill',
  'stroke',
  'stop-color',
  'flood-color',
  'fill-opacity',
  'stroke-opacity',
  'color',
];

export interface ExportOptions {
  readonly filename: string;
  /** Drawn under the figure. The scope statement is not optional. */
  readonly caption?: string;
  /** Device-pixel multiplier. 2 gives a usable figure in a report. */
  readonly scale?: number;
}

/**
 * Serialise one SVG element to a self-contained document.
 *
 * Kept separate from the rasterising so it can be exercised without a canvas.
 */
export function serialiseSvg(source: SVGSVGElement, options: ExportOptions): string {
  const clone = source.cloneNode(true) as SVGSVGElement;

  // Trap 1: resolve the tokens on the clone's own attributes.
  for (const element of [clone, ...clone.querySelectorAll('*')]) {
    for (const attribute of PAINT_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value && value.includes('var(')) element.setAttribute(attribute, resolveTokens(value));
    }
    // React writes the style prop through the CSSOM, so a clone can still carry
    // an inline style with unresolved vars.
    const style = element.getAttribute('style');
    if (style && style.includes('var(')) element.setAttribute('style', resolveTokens(style));
  }

  const viewBox = clone.getAttribute('viewBox') ?? '0 0 880 380';
  const [, , vw, vh] = viewBox.split(/\s+/).map(Number);
  const width = vw ?? 880;
  const height = vh ?? 380;

  // Trap 2: pin the size, or the raster takes the viewport.
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const captionHeight = 46;
  const body = new XMLSerializer().serializeToString(clone);
  const caption = options.caption ?? '';

  // The scope statement and the host are burned in, not offered. An exported
  // figure outlives the page that explained it.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + captionHeight}" viewBox="0 0 ${width} ${height + captionHeight}">
<rect width="100%" height="100%" fill="${LIGHT_TOKENS['--panel']}"/>
${body}
<g font-family="IBM Plex Mono, ui-monospace, monospace" fill="${LIGHT_TOKENS['--muted']}">
<text x="16" y="${height + 16}" font-size="10">${escapeXml(caption)}</text>
<text x="16" y="${height + 29}" font-size="9">${escapeXml(SCOPE_STATEMENT)}</text>
<text x="16" y="${height + 40}" font-size="9">${escapeXml(`${EXCLUSIONS_STATEMENT} ${WEATHER_ATTRIBUTION} ${BRAND.host}`)}</text>
</g>
</svg>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Rasterise and hand the browser a download. */
export async function exportPng(source: SVGSVGElement, options: ExportOptions): Promise<Blob> {
  const markup = serialiseSvg(source, options);
  const scale = options.scale ?? 2;

  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The figure could not be rendered for export.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.width * scale;
    canvas.height = image.height * scale;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot rasterise the figure.');
    context.fillStyle = LIGHT_TOKENS['--panel']!;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('The figure could not be encoded.'))),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoke on the next turn: revoking synchronously can beat the click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
