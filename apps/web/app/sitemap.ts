import type { MetadataRoute } from 'next';
import { getIpos, getPosts, ipoUrlHandles } from '@/lib/api';
import { SITE_ORIGIN } from '@/lib/site';

/**
 * Static-export sitemap — emitted at build time into `out/sitemap.xml`.
 *
 * Only CANONICAL urls go in. The IPO detail route statically emits both the
 * slug and the raw symbol for backward compatibility, but canonical always
 * points at the slug form, so that is the only one listed here.
 *
 * When the API is unreachable from the build box both `getIpos()` and
 * `getPosts()` return [] and the sitemap carries the static pages alone rather
 * than inventing handles. (We read posts through `getPosts`, not `postSlugs`,
 * because the latter substitutes a placeholder slug for an empty catalog and
 * that page renders as not-found.) An incomplete sitemap is fine; a sitemap
 * full of 404s is not.
 */

type Entry = MetadataRoute.Sitemap[number];

/** Pages that exist in Hindi too (`/hi/...`) — home and IPO detail only. */
const withLangs = (path: string): Entry['alternates'] => ({
  languages: {
    en: `${SITE_ORIGIN}${path}`,
    hi: `${SITE_ORIGIN}/hi${path === '/' ? '/' : path}`,
    'x-default': `${SITE_ORIGIN}${path}`,
  },
});

const STATIC: Array<[path: string, priority: number, changeFrequency: Entry['changeFrequency']]> = [
  ['/', 1.0, 'daily'],
  // The allotment checker answers ANY pan and is the highest-intent page we own.
  ['/allotment/', 0.9, 'daily'],
  ['/ipos/open/', 0.9, 'daily'],
  ['/ipos/upcoming/', 0.8, 'daily'],
  ['/ipos/listed/', 0.7, 'daily'],
  ['/sme/', 0.7, 'daily'],
  ['/subscription/', 0.8, 'hourly'],
  ['/gmp/', 0.7, 'daily'],
  ['/performance/', 0.7, 'daily'],
  ['/calendar/', 0.7, 'daily'],
  ['/news/', 0.6, 'daily'],
  ['/glossary/', 0.6, 'weekly'],
  ['/ipos/archive/', 0.4, 'weekly'],
  ['/about/', 0.4, 'monthly'],
  ['/faqs/', 0.5, 'monthly'],
  ['/terms/', 0.2, 'yearly'],
  ['/disclaimer/', 0.2, 'yearly'],
  ['/privacy-policy/', 0.2, 'yearly'],
  ['/attributions/', 0.2, 'yearly'],
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const pages: MetadataRoute.Sitemap = STATIC.map(([path, priority, changeFrequency]) => ({
    url: `${SITE_ORIGIN}${path}`,
    lastModified,
    changeFrequency,
    priority,
    ...(path === '/' ? { alternates: withLangs('/') } : {}),
  }));

  const [ipos, posts, handles] = await Promise.all([getIpos(), getPosts(200), ipoUrlHandles()]);

  // Only list detail pages the export actually emitted. `generateStaticParams`
  // builds from `ipoUrlHandles()`, and the list endpoint caps at 500 by
  // default — so the catalog can hold more IPOs than there are pages. Gating
  // on the same source makes it impossible for the sitemap to advertise a 404,
  // whichever side's limit changes later.
  const emitted = new Set(handles);

  for (const ipo of ipos) {
    const handle = ipo.slug ?? ipo.symbol;
    if (!handle || handle === 'no-ipos') continue;
    if (!emitted.has(handle)) continue;
    pages.push({
      url: `${SITE_ORIGIN}/ipos/${handle}/`,
      lastModified,
      // Open and upcoming issues move daily; a listed one is settled history.
      changeFrequency: ipo.status === 'listed' ? 'monthly' : 'daily',
      priority: ipo.status === 'listed' ? 0.5 : 0.8,
      alternates: withLangs(`/ipos/${handle}/`),
    });
  }

  for (const post of posts) {
    if (!post.slug) continue;
    pages.push({
      url: `${SITE_ORIGIN}/news/${post.slug}/`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }

  return pages;
}
