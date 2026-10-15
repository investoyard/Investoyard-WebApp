/**
 * The public origin this site is served from.
 *
 * Needed as an ABSOLUTE url in three places that a relative path cannot serve:
 * `metadataBase` (which is what resolves the relative `canonical` values in
 * `detailAlternates` and friends), `sitemap.xml`, and `robots.txt`.
 *
 * Override per environment with NEXT_PUBLIC_SITE_ORIGIN — it is read at BUILD
 * time, since the site is a static export. One build therefore carries exactly
 * one canonical host, which is why moving domains is a rebuild and not a
 * config change on the server.
 */
export const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://investoyard.com'
).replace(/\/+$/, '');

/** The canonical host, bare and lowercase — what `location.hostname` returns. */
export const SITE_HOST = new URL(SITE_ORIGIN).hostname;

/**
 * EVERY HOST THAT IS STILL OURS, not just the canonical one.
 *
 * This exists for the white-label branch. A host that is not ours gets
 * `data-foreign-host` set before paint, which hides `[data-own-only]` — our
 * own legal prose, our footer identity. So a host missing from this list stops
 * showing OUR About and Terms on OUR OWN site: the pages render as though a
 * partner had published nothing.
 *
 * WHAT IS **NOT** HERE MATTERS MORE THAN WHAT IS. `newipo.finwave.co` served
 * our own brand until 2026-10-15 and sat on this list for one afternoon as a
 * retiring host. It is now FINWAVE's white-label domain, and had it stayed
 * here the partner's site would have rendered OUR About, Terms, Privacy,
 * Disclaimer and footer identity to THEIR clients — a contract naming the
 * wrong company, which is the one thing the white-label work exists to stop.
 *
 * A host stops being ours the moment something else is pointed at it. So this
 * list holds only hosts serving OUR brand, and a retired one comes off as soon
 * as it is reassigned — not on a cache-expiry schedule.
 */
export const OWN_HOSTS: readonly string[] = [
  SITE_HOST,
  `www.${SITE_HOST}`,
  'localhost',
  '127.0.0.1',
];

/** Absolute url for a site-relative path. */
export const absolute = (path: string) =>
  `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
