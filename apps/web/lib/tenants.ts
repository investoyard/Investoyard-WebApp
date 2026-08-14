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
  isDefault?: boolean;
  flags: { gmpEnabled: boolean; upiCap: number };
}

export const TENANTS: Tenant[] = [
  { id: 't-direct', slug: 'investoyard', type: 'direct', name: 'Investoyard', isDefault: true, flags: { gmpEnabled: true, upiCap: 500000 } },
  { id: 't-axis', slug: 'axis', type: 'partner', name: 'Axis IPO', customDomain: 'ipo.axis.example', brandColor: '#c1121f', flags: { gmpEnabled: true, upiCap: 500000 } },
  { id: 't-pbank', slug: 'partnerbank', type: 'partner', name: 'PartnerBank IPO', customDomain: 'ipo.partnerbank.example', brandColor: '#0b5cad', flags: { gmpEnabled: false, upiCap: 500000 } },
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
    isDefault: a.type === 'direct',
    flags: { gmpEnabled: a.flags?.gmpEnabled ?? true, upiCap: Number(a.flags?.upiCap) || 500000 },
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
