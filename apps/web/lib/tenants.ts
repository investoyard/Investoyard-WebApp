import {
  UPI_MANDATE_MAX,
  TenantContent,
  resolveIdentity,
  resolveContact,
  displayName,
  legalEntity,
} from '@investoyard/shared-types';
/**
 * Multi-tenant foundation (web) — mock registry + host-based resolution + branding.
 *
 * Resolution mirrors the server design: the DOMAIN decides the tenant/brand.
 *  - our domain (or unknown host)  → Investoyard Direct (default brand)
 *  - a partner's registered domain → that partner's tenant + brand
 * On the current static build this runs client-side; when the web tier moves to
 * Node/SSR it becomes middleware (same registry, same resolver). TODO(prod): load
 * the registry from the API instead of this in-memory list.
 *
 * Local testing: append `?brand=<slug>` (e.g. ?brand=partnerbank) — persisted for
 * the session so it survives navigation. `?brand=investoyard` resets to default.
 */

export type TenantType = 'platform' | 'direct' | 'partner' | 'branch';

export interface Tenant {
  id: string;
  slug: string;
  type: TenantType;
  name: string;
  customDomain?: string;       // white-label domain (prod resolution)
  brandColor?: string;         // primary brand hex; undefined ⇒ default Investoyard palette
  goldColor?: string;          // optional accent override
  logo?: string;               // logo URL; undefined ⇒ text wordmark (or default logo for platform)
  /**
   * A mark made for the DARK footer. Absent ⇒ `logo` is used and forced white
   * by `.footer-logo`, which always reads but flattens the brand colour.
   * Present ⇒ rendered exactly as uploaded, because the partner has supplied
   * something already designed for that background.
   */
  footerLogo?: string;
  /**
   * The browser-tab icon. Absent ⇒ `logo` is used, and absent too ⇒ our icon
   * links are REMOVED rather than left pointing at ours.
   */
  favicon?: string;
  isDefault?: boolean;
  flags: { gmpEnabled: boolean; upiCap: number; whatsappChannel: string };
  /**
   * WHO OPERATES THIS SITE — the legal entity and how to reach it.
   *
   * Comes down on the same `/tenants` call as the branding, so the footer can
   * render on the first paint without a second request. Always an object; the
   * halves are absent until the operator enters them, and `resolveIdentity`
   * decides what may be substituted (for the DEFAULT channel, nothing else).
   */
  content: TenantContent;
}

export const TENANTS: Tenant[] = [
  { id: 't-direct', slug: 'investoyard', type: 'direct', name: 'Investoyard', isDefault: true, content: {}, flags: { gmpEnabled: true, upiCap: UPI_MANDATE_MAX, whatsappChannel: '' } },
  { id: 't-axis', slug: 'axis', type: 'partner', name: 'Axis IPO', customDomain: 'ipo.axis.example', brandColor: '#c1121f', content: {}, flags: { gmpEnabled: true, upiCap: UPI_MANDATE_MAX, whatsappChannel: '' } },
  { id: 't-pbank', slug: 'partnerbank', type: 'partner', name: 'PartnerBank IPO', customDomain: 'ipo.partnerbank.example', brandColor: '#0b5cad', content: {}, flags: { gmpEnabled: false, upiCap: UPI_MANDATE_MAX, whatsappChannel: '' } },
];

export const DEFAULT_TENANT: Tenant = TENANTS.find((t) => t.isDefault)!;

const OUR_HOSTS = new Set(['investoyard.com', 'www.investoyard.com', '127.0.0.1']);
const defaultOf = (list: Tenant[]) => list.find((t) => t.isDefault) ?? list.find((t) => t.type === 'direct') ?? DEFAULT_TENANT;

/** Domain → tenant. Our/unknown hosts fall back to the default (Investoyard Direct). */
export function resolveTenantByHost(host?: string, list: Tenant[] = TENANTS): Tenant {
  const def = defaultOf(list);
  if (!host) return def;
  const h = host.toLowerCase().split(':')[0];
  if (OUR_HOSTS.has(h) || h === 'localhost' || h.endsWith('.local')) return def;
  return list.find((t) => t.customDomain?.toLowerCase() === h) ?? def;
}

/** Dev override: pick a tenant by slug (from ?brand=). */
export function resolveTenantBySlug(slug?: string | null, list: Tenant[] = TENANTS): Tenant | undefined {
  if (!slug) return undefined;
  return list.find((t) => t.slug === slug.toLowerCase());
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
function mapApi(a: any): Tenant {
  return {
    id: a.id, slug: a.slug, type: a.type, name: a.name, customDomain: a.customDomain,
    brandColor: a.brandColor, goldColor: a.goldColor, logo: a.logoUrl,
    footerLogo: a.footerLogoUrl,
    favicon: a.faviconUrl,
    isDefault: a.type === 'direct',
    /* An API that predates the content store sends nothing; `{}` keeps every
       reader able to say `content.identity` without a guard. */
    content: (a.content && typeof a.content === 'object' ? a.content : {}) as TenantContent,
    flags: {
      gmpEnabled: a.flags?.gmpEnabled ?? true,
      upiCap: Number(a.flags?.upiCap) || UPI_MANDATE_MAX,
      whatsappChannel: typeof a.flags?.whatsappChannel === 'string' ? a.flags.whatsappChannel : '',
    },
  };
}

/** Load the tenant registry from the API (DB-driven); falls back to the built-in list. */
export async function fetchTenants(): Promise<Tenant[]> {
  try {
    const r = await fetch(`${API}/tenants`);
    if (!r.ok) return TENANTS;
    const data = await r.json();
    const mapped = (Array.isArray(data) ? data : []).map(mapApi);
    return mapped.length ? mapped : TENANTS;
  } catch {
    return TENANTS;
  }
}

/* ---------------------------------------------------------------- branding */
const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => clamp(x).toString(16).padStart(2, '0')).join('');
const mixWhite = (hex: string, amt: number) => { const [r, g, b] = hexToRgb(hex); return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt); };
const darken = (hex: string, amt: number) => { const [r, g, b] = hexToRgb(hex); return toHex(r * (1 - amt), g * (1 - amt), b * (1 - amt)); };

/** Full brand scale derived from a single primary colour. */
function palette(base: string): Record<string, string> {
  return {
    '--brand': base,
    '--brand-700': darken(base, 0.16),
    '--brand-600': darken(base, 0.08),
    '--brand-500': darken(base, 0.02),
    '--brand-400': mixWhite(base, 0.30),
    '--brand-200': mixWhite(base, 0.62),
    '--brand-100': mixWhite(base, 0.80),
    '--brand-50': mixWhite(base, 0.92),
    '--ink-grad': `linear-gradient(135deg, ${base}, ${darken(base, 0.30)})`,
  };
}

const BRAND_KEYS = ['--brand', '--brand-700', '--brand-600', '--brand-500', '--brand-400', '--brand-200', '--brand-100', '--brand-50', '--ink-grad', '--gold', '--gold-600'];

/** Paint (or reset) the tenant's brand onto the design-token CSS variables. */
export function applyBranding(t: Tenant): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (t.isDefault || !t.brandColor) { BRAND_KEYS.forEach((k) => root.style.removeProperty(k)); return; }
  Object.entries(palette(t.brandColor)).forEach(([k, v]) => root.style.setProperty(k, v));
  if (t.goldColor) { root.style.setProperty('--gold', t.goldColor); root.style.setProperty('--gold-600', darken(t.goldColor, 0.1)); }
}

/* ------------------------------------------------- published identity (web) */
/**
 * Adapters onto the SHARED resolvers in `@investoyard/shared-types`.
 *
 * Four one-liners rather than the shape repeated at each call site: the footer,
 * the contact page and the Organization structured data must agree about who
 * operates the site, and the rule they agree on — a white-label never inherits
 * our identity — lives in one tested module, not in three components.
 */
export const identityInput = (t: Tenant) => ({
  isDefault: !!t.isDefault,
  name: t.name,
  identity: t.content?.identity,
  contact: t.content?.contact,
});
export const tenantIdentity = (t: Tenant) => resolveIdentity(identityInput(t));
export const tenantContact = (t: Tenant) => resolveContact(t.content?.contact);
/** Never empty — the footer and the page title both need something to print. */
export const tenantDisplayName = (t: Tenant) => displayName(identityInput(t));
/** Undefined until a legal entity is known; the caller must then say nothing. */
export const tenantLegalEntity = (t: Tenant) => legalEntity(identityInput(t));

/* ------------------------------------------------------- published pages */
/**
 * One published page for a channel — About, Terms, Privacy or Disclaimer.
 *
 * A REQUEST OF ITS OWN, deliberately: the `/tenants` registry is fetched on
 * every page load to resolve the brand, so carrying four rich-text blobs per
 * tenant on it would make a reader of the home page download every partner's
 * legal prose.
 *
 * Returns `null` when the channel or the page is unknown, `''` when the tenant
 * exists and has published nothing — the trust pages render different copy for
 * those two, so the distinction has to survive the wire. Nest sends an EMPTY
 * BODY for a null handler result, not the string "null", so this reads the body
 * as text rather than calling `res.json()` (which throws "Unexpected end of
 * JSON input" — the fault that once broke /partner/apply for every first-time
 * visitor).
 */
export async function fetchTenantPage(slug: string, key: string): Promise<string | null> {
  try {
    const r = await fetch(`${API}/tenants/${encodeURIComponent(slug)}/page/${encodeURIComponent(key)}`);
    if (!r.ok) return null;
    const text = await r.text();
    if (!text.trim()) return null;
    const html = (JSON.parse(text) as { html?: unknown }).html;
    return typeof html === 'string' ? html : null;
  } catch {
    return null;
  }
}
