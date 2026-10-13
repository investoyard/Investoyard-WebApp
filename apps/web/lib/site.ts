/**
 * The public origin this site is served from.
 *
 * Needed as an ABSOLUTE url in three places that a relative path cannot serve:
 * `metadataBase` (which is what resolves the relative `canonical` values in
 * `detailAlternates` and friends), `sitemap.xml`, and `robots.txt`.
 *
 * Override per environment with NEXT_PUBLIC_SITE_ORIGIN — it is read at BUILD
 * time, since the site is a static export.
 */
export const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://newipo.finwave.co'
).replace(/\/+$/, '');

/** Absolute url for a site-relative path. */
export const absolute = (path: string) =>
  `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
