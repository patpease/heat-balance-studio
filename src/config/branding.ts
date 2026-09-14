/**
 * Brand constants stamped onto every export.
 *
 * `host` and the deployed route must move together — ZEEL records this as the
 * thing that is easy to forget, because an export carrying the wrong hostname
 * outlives the deploy that produced it.
 */
export const BRAND = {
  name: 'Heat Balance Studio',
  studio: 'Pease Studio',
  /**
   * Where the studio eyebrow points. The tool sits on its own subdomain, so
   * this is the only route a reader — or a crawler — has back to the site that
   * publishes it.
   */
  studioUrl: 'https://peasestudio.com/',
  host: 'heatbalance.peasestudio.com',
} as const;

/**
 * The prose lives in copy.ts, which is the file Patrick edits. Re-exported here
 * so the export path and the Worker keep one import and there is never a second
 * copy of the same sentence to drift.
 */
export { EXCLUSIONS_STATEMENT, SCOPE_STATEMENT, WEATHER_ATTRIBUTION } from './copy';

/**
 * The studio footer's links — the same set, in the same order, as the footer on
 * peasestudio.com. Kept here beside the rest of the identity rather than
 * imported, because the site is a separate repo and a separate deploy.
 *
 * Privacy points at the studio's policy: one studio, one policy, and it already
 * covers the tools by saying nothing is collected anywhere.
 */
export type FooterLink = {
  readonly label: string;
  readonly href: string;
  /** Drawn inline. A deliberately closed set: a footer of icons is noise. */
  readonly icon?: 'coffee';
};

export const FOOTER_LINKS: readonly FooterLink[] = [
  { label: 'Privacy', href: 'https://peasestudio.com/privacy/' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/patrick-pease-eng/' },
  { label: 'GitHub', href: 'https://github.com/patpease' },
  { label: 'Email', href: 'mailto:peasestudio@gmail.com' },
  {
    label: 'Buy me a coffee',
    href: 'https://buymeacoffee.com/peasestudio',
    icon: 'coffee',
  },
];

/** Alias so SiteFooter.tsx is identical across the tools. */
export const STUDIO_NAME = BRAND.studio;
