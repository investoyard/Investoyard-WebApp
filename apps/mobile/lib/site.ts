/**
 * The public website origin — ONE constant for the whole app.
 *
 * The phone app links out to the web surface in two places that are easy to
 * miss: the Account tab's trust-page links, and the share sheet on an IPO
 * detail page. Both used to hold their own copy of the host, which is how a
 * share message keeps naming a retired domain long after the site has moved —
 * and a share link is the one URL that leaves the app and gets forwarded.
 *
 * Overridable so a build can be pointed at a staging site; read at BUNDLE
 * time, like every other EXPO_PUBLIC_* value.
 *
 * NOT the API origin. The two are separate hosts (see lib/api.ts) and as of
 * the 2026-10-15 domain move the API stayed on its own host while the site
 * changed — so sharing one constant between them would have been wrong.
 */
export const SITE_ORIGIN = (
  process.env.EXPO_PUBLIC_SITE_URL ?? 'https://investoyard.com'
).replace(/\/+$/, '');

/** Absolute website url for a site-relative path. */
export const siteUrl = (path: string) =>
  `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
