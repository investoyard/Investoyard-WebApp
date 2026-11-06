'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { OWN_HOSTS, SITE_HOST } from '@/lib/site';

/**
 * Repoint the canonical, og:url and hreflang alternates at the host actually
 * serving the page.
 *
 * WHAT WAS WRONG. `metadataBase` bakes OUR origin into all of them, and a static
 * export answers every host with one set of HTML — so every page of a partner's
 * white-label carried `<link rel="canonical" href="https://investoyard.com/…">`.
 * That is not a cosmetic leak: a canonical pointing elsewhere asks Google to
 * index the OTHER page instead, so a broker's entire site was asking not to be
 * indexed at all. The hreflang pair said their Hindi page lives on our domain
 * too. It is live today on `newipo.finwave.co`, the one custom domain in the
 * database.
 *
 * WHY THIS IS AN EFFECT AND NOT THE PRE-PAINT SCRIPT, which is where it was
 * written first and where it does not work. Next renders this metadata as part
 * of the React tree, so mutating it during parse makes React re-insert its own
 * copy at hydration: a foreign host measured TWO canonicals, two og:urls and
 * SIX hreflang tags against 1/1/3 on ours. A second canonical leaves a crawler
 * choosing between two answers and the wrong one is still on the page — the
 * exact failure this exists to avoid. `<html>` ATTRIBUTES are safe there
 * (React never rendered them, which is why `data-foreign-host` has worked for
 * weeks); HEAD TAGS IT RENDERED ARE NOT. Same place and same mechanism as
 * `TenantSchema`, whose docblock has asked for this pass since it was written.
 *
 * Nothing is lost by the later timing. These tags are never painted, so there
 * is no flash to prevent, and a crawler that executes JavaScript reads the
 * settled DOM.
 *
 * IT NEEDS NO TENANT, only the host — so it runs on mount rather than waiting
 * for the registry fetch, and a registry that never answers cannot leave a
 * partner's pages pointing at us.
 *
 * KEYED ON THE PATHNAME because Next rewrites metadata on client navigation,
 * which would silently restore the baked values on the second page someone
 * visits. The first version keyed on nothing and would have fixed only the
 * landing page of each session.
 *
 * KNOWN RESIDUE, and it cannot be fixed from here: a scraper that does NOT run
 * JavaScript — most social link-preview bots — still reads the baked og:url,
 * so a shared partner page previews with a link to us. Google and Bing render
 * JS, so the canonical half is genuinely fixed. The complete answer is a
 * per-host build or a server render.
 */
export function TenantCanonical() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      const host = window.location.hostname;
      /* Our own hosts keep their server render, untouched. */
      if (OWN_HOSTS.includes(host)) return;

      const origin = window.location.origin;
      const here = origin + window.location.pathname;

      /* ONLY tags that currently name OUR host are rewritten. A partner who one
         day supplies their own alternate must not have it overwritten, and a
         tag already pointing at this host is left alone rather than rewritten
         to the same value. */
      const ours = (url: string | null): boolean => {
        if (!url) return false;
        try {
          const h = new URL(url, origin).host;
          return h === SITE_HOST || h === `www.${SITE_HOST}`;
        } catch { return false; }
      };

      document.querySelectorAll('link[rel="canonical"]').forEach((el) => {
        if (ours(el.getAttribute('href'))) el.setAttribute('href', here);
      });
      document.querySelectorAll('meta[property="og:url"]').forEach((el) => {
        if (ours(el.getAttribute('content'))) el.setAttribute('content', here);
      });
      /* The alternates keep their own PATH — `/hi/ipos/x/` is still the Hindi
         page — and change only the origin. Rewriting them all to `here` would
         declare every language the same URL. */
      document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => {
        const href = el.getAttribute('href');
        if (!ours(href)) return;
        el.setAttribute('href', origin + new URL(href!, origin).pathname);
      });
    } catch { /* a metadata tweak must never break the page */ }
  }, [pathname]);

  return null;
}
