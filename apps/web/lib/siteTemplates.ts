/**
 * Which layout each host gets, resolved at BUILD time.
 *
 * WHY THIS IS BAKED AND NOT LOOKED UP IN THE BROWSER. The site is a static
 * export: one set of HTML answers every host, so nothing of ours is in the
 * request path and a layout cannot be chosen per request. The two honest
 * options are to bake a host map into the HTML or to swap the layout after
 * hydration — and swapping costs exactly what the static export exists to buy.
 * A partner's first paint would be OUR layout, visibly rearranging a tick
 * later, and a crawler reading the pre-render snapshot would index our layout
 * on their domain. `/terms` once shipped 31 characters of markup for the same
 * reason, and the lesson is written up: the server render has to be right.
 *
 * SO THE MAP IS BAKED AND THE BROWSER ONLY CORRECTS IT. `TenantProvider` sets
 * the attribute again once it has resolved the live tenant, which covers a
 * template changed since the last build — the nightly 04:30 rebuild bounds how
 * long that correction is needed to one day.
 *
 * A DEAD API AT BUILD TIME GIVES AN EMPTY MAP, which is the right degradation
 * and the same one `safeGet` takes: every partner host renders our own layout,
 * nothing is wrong on the page, and the runtime pass fixes it. The alternative —
 * failing the build — would take the whole site down over a cosmetic field.
 */
import { apiUrl } from '@/lib/api';
import { isSiteTemplate, isSiteFont, DEFAULT_TEMPLATE, DEFAULT_FONT, type SiteTemplate, type SiteFont } from '@investoyard/shared-types';

/** What one host gets. Absent from the map = our own layout. */
export interface HostPresentation {
  template: SiteTemplate;
  font: SiteFont;
}

export type HostTemplateMap = Record<string, HostPresentation>;

/**
 * Build the host map from the public tenant registry.
 *
 * Only hosts that actually differ from our default are included — a partner on
 * our layout and our font needs no entry, and leaving them out keeps the inline
 * script to the few hundred bytes it is today rather than one line per tenant.
 *
 * BOTH the apex and the `www.` form are mapped for each domain. A partner who
 * points both at us without a redirect would otherwise get their layout on one
 * and ours on the other, which looks like a broken deploy rather than a missing
 * DNS record.
 */
export async function hostTemplateMap(): Promise<HostTemplateMap> {
  let rows: any[] = [];
  try {
    const res = await fetch(apiUrl('/tenants'));
    if (!res.ok) return {};
    const data = await res.json();
    rows = Array.isArray(data) ? data : [];
  } catch {
    return {};
  }

  const out: HostTemplateMap = {};
  for (const t of rows) {
    const domain = typeof t?.customDomain === 'string' ? t.customDomain.trim().toLowerCase() : '';
    if (!domain) continue;
    /* The default channel is pinned to our layout by `resolveSite`; honouring a
       stored template for it here would be a second opinion on that rule. */
    if (t?.type === 'direct' || t?.type === 'platform') continue;

    const site = t?.content?.site ?? {};
    const template: SiteTemplate = isSiteTemplate(site.template) ? site.template : DEFAULT_TEMPLATE;
    const font: SiteFont = isSiteFont(site.font) ? site.font : DEFAULT_FONT;
    if (template === DEFAULT_TEMPLATE && font === DEFAULT_FONT) continue;

    const host = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    out[host] = { template, font };
    if (!host.startsWith('www.')) out[`www.${host}`] = { template, font };
  }
  return out;
}

/**
 * The map, flattened to what the inline script needs: `host -> "template|font"`.
 *
 * A STRING PAIR RATHER THAN A NESTED OBJECT, because this is serialised into a
 * script tag on every one of ~2,643 pages. The nested form costs roughly three
 * times the bytes for the same information, repeated on every page in the
 * export, and the script has to split a string either way.
 */
export function flattenHostMap(map: HostTemplateMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [host, p] of Object.entries(map)) out[host] = `${p.template}|${p.font}`;
  return out;
}
