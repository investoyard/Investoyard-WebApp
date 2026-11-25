/**
 * A partner's PUBLIC SITE (apps/partner) — when it may go live, and when its
 * published build is out of date. Read by the API (the admin switch and the
 * status line), by the partner build (which stamps its fingerprints) and by
 * scripts/partner-sites-watch.js (which acts on both), so the three cannot
 * disagree about either question.
 */
import { contentGaps, type TenantContact, type TenantIdentity } from './tenantContent';

/** The registry fields a partner build bakes in. A change to any of them needs a rebuild of that design. */
export interface PartnerSiteInput {
  slug: string;
  name: string;
  customDomain?: string | null;
  brandColor?: string | null;
  logoUrl?: string | null;
  footerLogoUrl?: string | null;
  flags?: { gmpEnabled?: boolean } | null;
  content?: { identity?: TenantIdentity | null; contact?: TenantContact | null } | null;
}

function stable(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined && o[k] !== null && o[k] !== '').sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** FNV-1a, 32-bit, as 8 hex characters. Plain arithmetic, so a browser build and a Node script compute the same value. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * A short fingerprint of what a partner build bakes for this partner: name,
 * domain, brand colour, logos, GMP flag, identity and contact. The DESIGN is
 * deliberately left out — changing it is a re-route, not a rebuild.
 */
export function partnerSiteFingerprint(t: PartnerSiteInput): string {
  return fnv1a(stable({
    slug: t.slug,
    name: t.name,
    domain: String(t.customDomain || '').trim().toLowerCase().replace(/\.$/, ''),
    brand: t.brandColor,
    logo: t.logoUrl,
    footerLogo: t.footerLogoUrl,
    gmp: !!(t.flags && t.flags.gmpEnabled),
    identity: t.content?.identity ?? null,
    contact: t.content?.contact ?? null,
  }));
}

/** `slug:hash;slug:hash` — what a build writes into its pages and the watcher reads back. */
export function partnerSiteFingerprintList(tenants: PartnerSiteInput[]): string {
  return tenants.map((t) => `${t.slug}:${partnerSiteFingerprint(t)}`).join(';');
}
export function parsePartnerSiteFingerprints(s: string | null | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of String(s || '').split(';')) {
    const i = part.lastIndexOf(':');
    if (i > 0) m.set(part.slice(0, i), part.slice(i + 1));
  }
  return m;
}

/**
 * What must be filled in before a partner's site may go live (operator
 * decision 2026-11-25): the registered company name and the grievance
 * officer's name and email — the BLOCKING identity/contact gaps. A broker's
 * public site naming no company and no grievance contact is a compliance gap.
 * The legal PAGES are not part of it: an unpublished page says so on the
 * partner's site rather than naming the wrong company.
 * Returns the labels of what is missing; empty means it may go live.
 */
export function partnerSiteGate(t: { name: string; content?: PartnerSiteInput['content'] }): string[] {
  return contentGaps({
    isDefault: false,
    name: t.name,
    identity: t.content?.identity ?? undefined,
    contact: t.content?.contact ?? undefined,
  }).filter((g) => g.severity === 'blocking' && (g.key === 'identity' || g.key === 'contact')).map((g) => g.label);
}
