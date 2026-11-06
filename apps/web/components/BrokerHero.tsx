'use client';
import { useSite, useTenant } from '@/components/TenantProvider';
import { Icon } from '@/components/Icon';
import type { IpoListItem } from '@investoyard/shared-types';
import Link from 'next/link';
import * as calc from '@/lib/ipoCalc';
import { stageOf, stageLabel, toneOf, compareForList, shortName, titleCase, fmtDateTime } from '@investoyard/shared-types';

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
  const count = (...want: string[]) => stages.filter((s) => want.includes(s)).length;
  const open = count('live', 'opentoday', 'closingtoday');
  const upcoming = count('upcoming', 'preapply');
  /* THE TWO STAGES THE STRIP USED TO IGNORE, and on today's catalogue they are
     the only ones with anything in them besides Listed: 20 awaiting and 3
     allotment out. Without them a quiet week left the design's three-up strip
     showing ONE tile reading "1297 Recently listed", which says nothing a
     visitor can act on. Derived from the same `stageOf` as the rest, so the
     strip cannot state a count the page below it disagrees with. */
  const allotmentOut = count('allotmentout');
  const awaiting = count('awaiting');
  const listed = count('listed');

  return (
    <section className="tpl-hero">
      <div className="tpl-hero-in">
        {/* THE STATEMENT — the design's left column. */}
        <div className="tpl-hero-say">
          <span className="tpl-hero-eyebrow">
            <Icon name="shield" size={14} aria-hidden />
            ASBA · funds blocked, never debited
          </span>
          <h1 className="tpl-hero-h">{site.headline}</h1>
          <p className="tpl-hero-sub">{site.sub}</p>
          <div className="tpl-hero-cta">
            {/* `#ipo-views`, not `#ipos`: the latter is inside the explorer, which
                is `hidden` while another view is open, and scrolling to a
                display:none element does nothing. */}
            <a className="btn btn-primary" href="#ipo-views">
              {site.applyCta}
              <Icon name="arrow-right" size={15} aria-hidden />
            </a>
            <a className="btn btn-ghost" href={`/allotment${langQuery}`}>Check allotment</a>
          </div>
          {site.applyNote && <p className="tpl-hero-note">{site.applyNote}</p>}

          {/* The stat tiles. Each is shown only when there is something to
              count — "0 open now" is a worse statement than silence, and on a
              quiet week every one of these can legitimately be zero. The
              figures are DERIVED from the same list the table below renders,
              through the same `stageOf` every other surface reads, so a hero
              cannot state a count the page disagrees with. */}
          <div className="tpl-stat">
            {open > 0 && <span className="tpl-stat-i"><b>{open}</b><span>Open now</span></span>}
            {upcoming > 0 && <span className="tpl-stat-i"><b>{upcoming}</b><span>Upcoming</span></span>}
            {allotmentOut > 0 && <span className="tpl-stat-i"><b>{allotmentOut}</b><span>Allotment out</span></span>}
            {awaiting > 0 && <span className="tpl-stat-i"><b>{awaiting}</b><span>Awaiting allotment</span></span>}
            {listed > 0 && <span className="tpl-stat-i"><b>{listed}</b><span>Recently listed</span></span>}
            {!tenant.isDefault && (
              <span className="tpl-stat-i tpl-stat-asba">
                <b>UPI</b><span>Approve the mandate in your own bank app</span>
              </span>
            )}
          </div>
        </div>

        {/* THE LIVE ISSUE CARD — the design's right column, and its centrepiece.
            Rendered by `HeroIssueCard` so the statement above stays readable;
            it returns null when no issue is open, which collapses the hero to
            one column via the `auto-fit` grid with no media query. */}
        <HeroIssueCard ipos={ipos} langQuery={langQuery} />
      </div>
    </section>
  );
}

/**
 * THE LIVE ISSUE CARD — the design's right column and its centrepiece: a
 * gradient head carrying the issue and its headline multiple, four key
 * figures, a per-category subscription meter, the first rungs of the lot
 * ladder, and the way in.
 *
 * EVERY FIGURE COMES FROM THE SHARED RESOLVERS, never from the raw row, and
 * that is not style. `ipo.subscription[].timesSubscribed` is what the poller
 * STORED — demand ÷ the GROSS offer — while `subscriptionTable` recomputes
 * against the NET book after deducting the anchor. Reading the raw rows here
 * would make this card disagree with the subscription page it links to, which
 * is exactly the fault that had mobile's hub showing 14.82x against the detail
 * page's 36.74x on 59 records.
 *
 * IT RENDERS NOTHING WHEN THERE IS NO ISSUE TO SHOW, which collapses the hero
 * to a single column through the `auto-fit` grid with no media query and no
 * second code path — and an empty card beside a headline is worse than a
 * headline alone.
 *
 * NO GMP. The design's card does not carry one, and this is the surface a
 * first-time visitor meets: a grey-market figure belongs behind the disclaimer
 * gate, not in a hero. (It is also off and LOCKED for every white-label.)
 */
function HeroIssueCard({ ipos, langQuery }: { ipos: IpoListItem[]; langQuery: string }) {
  /* The issue a visitor can act on: open and closing soonest, else the next to
     open. `compareForList` already collapses the three open stages and sorts
     them by close date, so this is one read of the house ordering rather than a
     second opinion about which issue matters. */
  /* THE MOST ACTIONABLE ISSUE IN THE CATALOGUE, which is what `compareForList`
     already ranks: Closing Today / Open Today / Live -> Pre Apply -> Upcoming
     -> Allotment Out -> Awaiting -> Listed, with the open trio collapsed and
     sorted by close date. So `ranked[0]` expresses the house preference rather
     than a second opinion about which issue matters.

     IT IS DELIBERATELY NOT "the first OPEN issue, else nothing", which is what
     this card did first and which made it invisible. Measured on the live
     catalogue: of 1,319 records the enriched stages are 1,297 listed, 20
     awaiting and 3 allotment out — ZERO open and ZERO upcoming — so the
     design's centrepiece rendered as an empty second grid column and the hero
     collapsed to a headline beside nothing. A broker's shop window cannot go
     blank because no issue happens to be bidding this week, and Allotment Out
     is a perfectly good thing to lead with: it is the one stage where a
     visitor has something to do today.

     THE RAW `status` COLUMN WOULD SAY OTHERWISE AND IS WRONG. It reports 124
     of these as `upcoming`; `enrich()` overwrites it with `effectiveStatus`,
     which correctly reads them as long-listed historical rows. `stageOf` is
     the only thing to count with — a tally of the column is the measurement
     mistake that had this card looking broken when it was behaving. */
  const ranked = [...ipos].sort(compareForList as any);
  const pick = ranked[0];

  /* Only an EMPTY catalogue leaves nothing to show now — which is the API
     being unreachable at build time, where the explorer below renders its own
     empty state and a hero card would be a second, quieter version of it. */
  if (!pick) return null;

  const stage = stageOf(pick as any);
  const open = stage === 'live' || stage === 'opentoday' || stage === 'closingtoday';
  /* NULL when the record has no reservation table — 1,209 of them do not, so
     this is the common case and not an edge one. The card then shows the band
     and the figures and simply has no meter. */
  const sub = calc.subscriptionTable(pick as any);
  const total = sub ? sub.total : null;
  const ladder = calc.lotLadder(pick as any);

  /* The four categories the design's meter shows, in the house order. A row is
     only drawn when the exchange has given it a figure — a bar at zero reads as
     a measurement of no demand rather than as an absence of data. */
  const meter = (sub ? ['qib', 'nii', 'hni', 'retail'] : [])
    .map((k) => sub!.rows.find((r) => r.key === k))
    .filter((r): r is NonNullable<typeof r> => !!r && r.times > 0)
    .slice(0, 4);

  const band = pick.priceBandMin != null && pick.priceBandMax != null && pick.priceBandMin !== pick.priceBandMax
    ? `₹${pick.priceBandMin}–${pick.priceBandMax}`
    : pick.priceBandMin != null ? `₹${pick.priceBandMin}` : '—';

  /* `issueSize` arrives from the list endpoint ALREADY FORMATTED ("₹30,213 Cr"),
     so it is printed as given and never put through Number(), which is NaN on
     every record — the fault that shipped a dash on the featured panel. */
  const size = typeof (pick as any).issueSize === 'string' && (pick as any).issueSize.trim()
    ? (pick as any).issueSize
    : typeof (pick as any).issueSizeCr === 'number' && (pick as any).issueSizeCr > 0
      ? `₹${(pick as any).issueSizeCr.toLocaleString('en-IN')} Cr`
      : '—';

  /* THE LEAD IS THE SUBSCRIPTION MULTIPLE WHENEVER THERE IS ONE, open or
     closed — it is the figure the card exists to carry and it appears nowhere
     else on the card. The band is the fallback, and in that case the strip
     DROPS its own Price band cell: leading with a figure that is repeated a
     hundred pixels below is the duplication this hero was redesigned to
     remove, and suppressing the cell is cheaper than inventing a fourth. */
  const multiple = total && total.times > 0 ? total.times : null;
  const leadFig = multiple != null ? `${multiple.toFixed(2)}×` : band;
  const leadSay = multiple == null ? 'price band' : open ? 'subscribed overall' : 'subscribed, final';

  const href = `/ipos/${pick.slug ?? pick.symbol}/${langQuery}`;

  return (
    <div className="tpl-hcard">
      {/* the gradient head — `--ink-grad` is derived from the TENANT's brand by
          `palette()`, so this carries the partner's colour and not a literal */}
      <div className="tpl-hcard-top">
        <div className="tpl-hcard-eye">
          {/* `.status`, NOT `.st`. `.st` carries explicit modifiers (ok/bad/mut/
              brand/warn) and reads NO tone token at all, so `st t-live` renders a
              colourless pill — a class used and not defined, which inherits the
              base rule and looks deliberate. `.status` is the one that reads
              --tone-soft/--tone-ink, and that is the pair measured for TEXT:
              --tone-solid/--tone-on is for a solid chip and leaves Awaiting at
              4.05:1. */}
          <span className={`status t-${toneOf(pick as any)}`}>{stageLabel(pick as any)}</span>
          <span>{pick.type === 'sme' ? 'SME' : 'Mainboard'}</span>
        </div>
        <Link className="tpl-hcard-nm" href={href} title={titleCase(pick.name)}>
          {shortName(pick.name)}
        </Link>
        <div className="tpl-hcard-lead">
          <b className="tpl-hero-fig">{leadFig}</b>
          <span>{leadSay}</span>
        </div>

        <div className="tpl-hcard-figs">
          {/* omitted when the band is already the lead figure above */}
          {multiple != null && <div><span>Price band</span><b className="tpl-hero-fig">{band}</b></div>}
          <div><span>Lot size</span><b className="tpl-hero-fig">{pick.lotSize ? pick.lotSize.toLocaleString('en-IN') : '—'}</b></div>
          <div><span>Min amount</span><b className="tpl-hero-fig">{pick.minAmount ? `₹${pick.minAmount.toLocaleString('en-IN')}` : '—'}</b></div>
          <div><span>Issue size</span><b className="tpl-hero-fig">{size}</b></div>
        </div>
      </div>

      <div className="tpl-hcard-body">
        {meter.length > 0 ? (
          <div className="tpl-hcard-meter">
            {meter.map((r) => (
              <div key={r.key}>
                {/* The bar is capped at 3x, matching the subscription page's own
                    meter, so the two read the same at a glance. */}
                <i style={{ ['--fill' as string]: `${Math.min(100, (r.times / 3) * 100)}%` }} aria-hidden />
                <span>{r.cat}</span>
                <b className="tpl-hero-fig">{r.times.toFixed(2)}×</b>
              </div>
            ))}
          </div>
        ) : null}

        {ladder.length > 0 ? (
          <div className="tpl-hcard-tbl">
            <table>
              <thead>
                <tr><th>Category</th><th>Lots</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {ladder.slice(0, 3).map((r: any) => (
                  <tr key={r.cat}>
                    <td>{r.cat}</td>
                    <td data-num>{r.lots ?? r.minLots ?? '—'}</td>
                    <td data-num>{typeof r.amount === 'number' ? `₹${r.amount.toLocaleString('en-IN')}` : (r.amount ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="tpl-hcard-act">
          {/* The apply CTA respects the operator's own gate: with Start Bid off,
              /apply renders "Bidding hasn't started yet", and a button that
              lands there is worse than no button. */}
          {open && (pick as any).extra?.startBid === true ? (
            <Link className="btn btn-primary" href={`/apply/${pick.symbol}/${langQuery}`}>Apply now</Link>
          ) : (
            <Link className="btn btn-primary" href={href}>View issue</Link>
          )}
          {/* NOT "Live subscription" unconditionally: that page serves the
              final figures for a closed issue, and today every issue in the
              catalogue is closed. The label states which it is. */}
          <Link className="btn btn-ghost" href={`/subscription/v2/?symbol=${pick.symbol}`}>
            {open ? 'Live subscription' : 'Subscription figures'}
          </Link>
        </div>

        {/* The as-of is on the RECORD, not on the resolver result, and it is a
            RAW ISO string — formatting it here rather than at the call site is
            the rule that fixed the detail page printing
            "Updated 2026-10-22T09:48:09.015Z" to customers. */}
        {pick.subscriptionAsOf ? <p className="tpl-hcard-foot">Updated {fmtDateTime(pick.subscriptionAsOf)}</p> : null}
      </div>
    </div>
  );
}
