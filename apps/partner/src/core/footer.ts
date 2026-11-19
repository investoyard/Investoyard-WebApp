import { PAGE_LABEL, type TenantPageKey } from '@investoyard/shared-types';
import type { PartnerIdentity } from './tenant.server';

/*
 * What every variant's footer may say, decided once.
 *
 * THE IDENTITY RULE: a partner's footer carries only what that partner has
 * entered — legal name, SEBI registration, CIN, registered address, support
 * and grievance contacts. Nothing of ours, and nothing invented. A field the
 * partner has not entered is simply absent; the footer gets shorter rather
 * than printing a placeholder or falling back to our details.
 *
 * Variants decide how the footer LOOKS. They must not decide what it SAYS,
 * which is why the wording and the field order live here.
 */

export interface FooterFact { k: string; v: string; href?: string }

export interface FooterModel {
  /** The name to print as the owner of the site: the legal name if entered, else the trade name. */
  owner: string;
  legalName: string | null;
  /** Registration lines: SEBI, CIN. */
  registration: FooterFact[];
  address: string | null;
  support: FooterFact[];
  grievance: FooterFact[];
}

const tel = (v: string) => `tel:${v.replace(/[^0-9+]/g, '')}`;

export function footerModel(p: PartnerIdentity): FooterModel {
  const registration: FooterFact[] = [];
  if (p.sebi) registration.push({ k: 'SEBI Reg. No.', v: p.sebi });
  if (p.cin) registration.push({ k: 'CIN', v: p.cin });
  const support: FooterFact[] = [];
  if (p.supportEmail) support.push({ k: 'Email', v: p.supportEmail, href: `mailto:${p.supportEmail}` });
  if (p.supportPhone) support.push({ k: 'Phone', v: p.supportPhone, href: tel(p.supportPhone) });
  const grievance: FooterFact[] = [];
  if (p.grievanceName) grievance.push({ k: 'Officer', v: p.grievanceName });
  if (p.grievanceEmail) grievance.push({ k: 'Email', v: p.grievanceEmail, href: `mailto:${p.grievanceEmail}` });
  if (p.grievancePhone) grievance.push({ k: 'Phone', v: p.grievancePhone, href: tel(p.grievancePhone) });
  return { owner: p.legalName || p.name, legalName: p.legalName, registration, address: p.address, support, grievance };
}

/*
 * WHICH LOGO A FOOTER SHOWS. The partner may upload two: the main logo (for a
 * light ground) and a footer logo (for a dark ground, usually white). A dark
 * footer prefers the footer logo; a light one prefers the main logo. When only
 * the "wrong" one exists it is still shown, on a plate of the opposite tone so
 * it stays legible. With neither, the variant prints the name.
 */
export function footerLogo(p: PartnerIdentity, ground: 'dark' | 'light'): { src: string; plate: boolean } | null {
  const first = ground === 'dark' ? p.footerLogo : p.logo;
  const second = ground === 'dark' ? p.logo : p.footerLogo;
  if (first) return { src: first, plate: false };
  if (second) return { src: second, plate: true };
  return null;
}

export const RISK_TEXT =
  'Investments in the securities market are subject to market risks. Read all related documents carefully before investing. ' +
  'IPO figures — dates, price bands, subscription and allotment — are as published by NSE, BSE and the registrar. ' +
  'This site informs; it does not recommend any issue.';

/** The partner's four legal pages, in footer order. Each is the partner's own text or says it is not published. */
export const LEGAL_PAGES: readonly { key: TenantPageKey; label: string; href: string }[] = (
  ['about', 'terms', 'privacy', 'disclaimer'] as const
).map((key) => ({ key, label: PAGE_LABEL[key], href: `/${key}/` }));

/*
 * The content pages every design carries at investoyard.com's own addresses.
 * The premium page is linked only where the partner publishes it — the page
 * exists for every partner (an old link must still land somewhere), but a
 * footer must not advertise figures the site does not show.
 */
export const moreIpoLinks = (p: PartnerIdentity) => [
  { href: '/performance/', label: 'Listing performance' },
  { href: '/news/', label: 'IPO news' },
  ...(p.gmp ? [{ href: '/gmp/', label: 'Exp. Premium' }] : []),
];
export const HELP_LINKS = [
  { href: '/faqs/', label: 'FAQs' },
  { href: '/glossary/', label: 'Glossary' },
  { href: '/contact/', label: 'Contact us' },
];
