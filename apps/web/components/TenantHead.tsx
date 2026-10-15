'use client';
import { useEffect } from 'react';
import { useTenant } from '@/components/TenantProvider';
import { tenantDisplayName } from '@/lib/tenants';

/** Our own brand as it appears in every built <title>. */
const OUR_BRAND = 'Investoyard';

/**
 * Correct the BROWSER TAB for the domain the page is served from — the title
 * and the favicon.
 *
 * Same root cause as `TenantSchema`: the site is a static export, so one set of
 * HTML answers every host and the server render cannot know whose domain it is
 * on. The visible page was already white-labelled; the tab was not. A partner's
 * client therefore saw their broker's site under OUR name and OUR "IY" icon in
 * the one piece of chrome that is on screen the entire visit, survives into
 * bookmarks, and is what the window switcher shows.
 *
 * ON OUR OWN HOST THIS DOES NOTHING. The resolved tenant is the default, both
 * effects return before touching the DOM, and our pages keep exactly the title
 * and icon the server rendered.
 */
export function TenantHead() {
  const tenant = useTenant();
  const name = tenantDisplayName(tenant);

  /* ---------------------------------------------------------------- title -- */
  useEffect(() => {
    if (tenant.isDefault || !name || name === OUR_BRAND) return;

    /*
     * A MUTATION OBSERVER, NOT A ONE-SHOT WRITE. Next sets document.title
     * itself on every client-side navigation, so a single assignment here is
     * overwritten the moment the reader opens any other page — and it would
     * come back as OUR brand, which is the exact failure this exists to stop.
     * Observing <title> catches the rewrite whenever and however it happens.
     *
     * Replacing the brand WORD rather than rebuilding the title keeps every
     * page's own wording: "Terms & Conditions | Investoyard" becomes
     * "Terms & Conditions | FINWAVE", and the home page's longer
     * "Investoyard — IPO information & application platform, India" keeps its
     * descriptive tail. Rebuilding would have meant re-deriving ~40 titles
     * here, which is the sort of second copy that drifts.
     */
    const brand = new RegExp(OUR_BRAND, 'g');
    const apply = () => {
      const el = document.querySelector('title');
      if (!el) return;
      const next = el.textContent?.replace(brand, name) ?? '';
      /* Guarded so our own write cannot retrigger the observer forever. */
      if (next && next !== el.textContent) el.textContent = next;
    };

    apply();

    /* <head> is observed rather than the <title> element, because Next may
       REPLACE the element rather than edit its text — and an observer bound to
       a node that gets swapped out stops firing silently. */
    const obs = new MutationObserver(apply);
    obs.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [tenant.isDefault, name]);

  /* -------------------------------------------------------------- favicon -- */
  useEffect(() => {
    if (tenant.isDefault) return;

    const links = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'),
    );
    if (!links.length) return;
    const before = links.map((l) => ({ el: l, href: l.getAttribute('href') }));

    const icon = tenant.favicon || tenant.logo;
    if (icon) {
      /* An uploaded favicon wins. Falling back to the logo is better than ours
         but imperfect — a wordmark squeezed into 16 square pixels is a smudge —
         so the upload is the override and the logo is the fallback. */
      for (const l of links) l.setAttribute('href', icon);
    } else {
      /* No mark to substitute, so REMOVE ours rather than leave it. The
         browser then falls back to its blank document icon, which says
         nothing — and saying nothing is correct, where saying "Investoyard"
         on a broker's domain is false. */
      for (const l of links) l.remove();
    }

    return () => {
      for (const { el, href } of before) {
        if (href !== null) el.setAttribute('href', href);
        if (!el.isConnected) document.head.appendChild(el);
      }
    };
  }, [tenant.isDefault, tenant.favicon, tenant.logo]);

  return null;
}
