import http from 'node:http';
import https from 'node:https';

/*
 * BUILD-TIME DATA. The export is generated from the live API on this box, the
 * same way apps/web does it.
 *
 * Two deliberate differences from apps/web:
 *  - plain node http, not Next's fetch cache. The catalogue is ~2.9 MB, over
 *    Next's 2 MB fetch-cache ceiling, and a cached failure has poisoned
 *    apps/web builds more than once. A module-level promise is enough: each
 *    build worker asks once.
 *  - a dead or empty API FAILS THE BUILD. apps/web swallows it and bakes a
 *    placeholder, which exits 0 with a perfect-looking log; its publish gate
 *    exists to catch exactly that. Failing loudly here is cheaper.
 */

const BASE = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3000/api';

function getJson<T>(path: string): Promise<T> {
  const url = new URL(BASE.replace(/\/$/, '') + path);
  const mod = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(url, { timeout: 60_000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`GET ${url.href} answered ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
        } catch (e) {
          reject(new Error(`GET ${url.href} returned a body that is not JSON`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`GET ${url.href} timed out`)));
    req.on('error', reject);
  });
}

export interface RawIpo {
  id: string;
  symbol: string;
  slug?: string;
  name: string;
  type: 'mainboard' | 'sme' | string;
  status: string;
  openDate?: string | null;
  closeDate?: string | null;
  allotmentDate?: string | null;
  listingDate?: string | null;
  priceBandMin?: number | string | null;
  priceBandMax?: number | string | null;
  lotSize?: number | string | null;
  minAmount?: number | string | null;
  issueSize?: number | string | null;
  issueSizeCr?: number | string | null;
  registrar?: string | null;
  exchanges?: string[] | null;
  isin?: string | null;
  logoUrl?: string | null;
  subscription?: unknown[];
  subscriptionAsOf?: string | null;
  documents?: { type: string; url: string }[];
  extra?: Record<string, any> | null;
}

export interface RawTenant {
  id: string;
  slug: string;
  type: string;
  name: string;
  customDomain?: string | null;
  brandColor?: string | null;
  logoUrl?: string | null;
  footerLogoUrl?: string | null;
  faviconUrl?: string | null;
  flags?: Record<string, any>;
  content?: Record<string, any>;
}

let iposP: Promise<RawIpo[]> | null = null;
let tenantsP: Promise<RawTenant[]> | null = null;

export function loadIpos(): Promise<RawIpo[]> {
  if (!iposP) {
    iposP = getJson<RawIpo[] | { items: RawIpo[] }>('/ipos?limit=2000').then((body) => {
      const list = Array.isArray(body) ? body : body.items ?? [];
      if (list.length < 100) {
        throw new Error(`The API returned ${list.length} IPOs — refusing to build a partner site from an empty or partial catalogue.`);
      }
      return list.filter((x) => !(x.extra && x.extra.hidden));
    });
  }
  return iposP;
}

export function loadTenants(): Promise<RawTenant[]> {
  if (!tenantsP) {
    tenantsP = getJson<RawTenant[] | { items: RawTenant[] }>('/tenants').then((body) =>
      Array.isArray(body) ? body : body.items ?? [],
    );
  }
  return tenantsP;
}

/*
 * NEWS POSTS, written in admin. Optional content, so unlike the catalogue a
 * failed read does NOT fail the build: the news page then says there is no
 * news, which is the truth about what reached this build. Each article's body
 * is fetched once at build time and sanitised where it is rendered.
 */
export interface RawPost {
  slug: string; title: string; excerpt?: string | null; coverUrl?: string | null;
  ipoSymbol?: string | null; tags?: string[]; author?: string | null; publishedAt?: string | null; body?: string;
}
let postsP: Promise<RawPost[]> | null = null;
export function loadPosts(): Promise<RawPost[]> {
  return (postsP = postsP || getJson<RawPost[]>('/posts?limit=60').then((p) => (Array.isArray(p) ? p.filter((x) => x && /^[A-Za-z0-9._-]+$/.test(x.slug || '')) : [])).catch(() => []));
}
const postP = new Map<string, Promise<RawPost | null>>();
export function loadPost(slug: string): Promise<RawPost | null> {
  if (!postP.has(slug)) postP.set(slug, getJson<RawPost>(`/posts/${encodeURIComponent(slug)}`).catch(() => null));
  return postP.get(slug)!;
}
