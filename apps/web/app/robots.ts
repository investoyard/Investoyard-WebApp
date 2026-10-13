import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/lib/site';

/**
 * Emitted at build time into `out/robots.txt`.
 *
 * The public research surface is open; the operator console, a visitor's own
 * account pages and the apply/print flows are not content and are kept out of
 * the index. `/ipos/live` is the client-side fallback shell the static export
 * needs for unknown handles — it has no content of its own.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/login/',
          '/account/',
          '/portfolio/',
          '/partner-api/',
          '/partner/',
          '/apply/',
          '/print/',
          '/homeold/',
          '/ipos/live/',
        ],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
