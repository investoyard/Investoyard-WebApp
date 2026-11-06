'use client';
import { useSite, useTenant } from '@/components/TenantProvider';
import { Icon } from '@/components/Icon';
import type { IpoListItem } from '@investoyard/shared-types';
import { stageOf } from '@investoyard/shared-types';

/**
 * The broker templates' hero: a headline, a sentence, two actions and a strip
 * of counts.
 *
 * WHY IT REPLACES THE CAROUSEL RATHER THAN JOINING IT. `HeroBanner` rotates
 * brand slides and per-IPO slides and is OUR hero — it spotlights our own
 * capability chips and our tagline. A broker introducing themselves needs one
 * sentence that stays still long enough to be read. Both are in the DOM on
 * every page and CSS shows exactly one, keyed on `data-template`, because a
 * static export cannot branch on the host at build time.
 *
 * WHAT IS LOST BY THIS BEING A CLIENT COMPONENT, stated plainly because it is
 * the same limit the canonical fix runs into: the server cannot know whose
 * domain it is on, so a partner's headline cannot be in the server HTML. It
 * appears after hydration. Google and Bing render JS and will read it; a
 * non-rendering crawler sees the page without its h1. The indexable substance —
 * the IPO catalogue below — IS server-rendered, so what arrives late is
 * marketing copy rather than content. A partner wanting first-class organic SEO
 * on their own domain needs SSR, which is its own piece of work and is already
 * written up against `TenantSchema`.
 *
 * THE COUNTS ARE DERIVED, NEVER TYPED. A hero that states "12 open now" from a
 * stored string is a hero that lies the day after it is written; these come
 * from the same list the explorer below renders, through the same `stageOf`
 * every other surface reads.
 */
export function BrokerHero({ ipos, langQuery }: { ipos: IpoListItem[]; langQuery: string }) {
  const site = useSite();
  const tenant = useTenant();

  /* `stageOf` returns the Stage STRING, not an object — and the three open
     stages are separate members because the CHIP has to tell them apart, which
     a count does not. Same collapse `compareForList` makes for sorting. */
  const stages = ipos.map((i) => stageOf(i as any));
  const open = stages.filter((s) => s === 'live' || s === 'opentoday' || s === 'closingtoday').length;
  const upcoming = stages.filter((s) => s === 'upcoming' || s === 'preapply').length;
  const listed = stages.filter((s) => s === 'listed').length;

  return (
    <section className="tpl-hero">
      <div className="tpl-hero-in">
        <h1 className="tpl-hero-h">{site.headline}</h1>
        <p className="tpl-hero-sub">{site.sub}</p>
        <div className="tpl-hero-cta">
          <a className="btn btn-primary" href="#ipos">
            {site.applyCta}
            <Icon name="arrow-right" size={15} aria-hidden />
          </a>
          <a className="btn btn-ghost" href={`/allotment${langQuery}`}>Check allotment</a>
        </div>
        {site.applyNote && <p className="tpl-hero-note">{site.applyNote}</p>}

        {/* The stat strip. Each figure is only shown when there is something to
            count — "0 open now" is a worse statement than silence, and on a
            quiet week every one of these can legitimately be zero. */}
        <div className="tpl-stat">
          {open > 0 && <span className="tpl-stat-i"><b>{open}</b> open now</span>}
          {upcoming > 0 && <span className="tpl-stat-i"><b>{upcoming}</b> upcoming</span>}
          {listed > 0 && <span className="tpl-stat-i"><b>{listed}</b> recently listed</span>}
          {!tenant.isDefault && <span className="tpl-stat-i tpl-stat-asba">ASBA — funds blocked, never debited</span>}
        </div>
      </div>
    </section>
  );
}
