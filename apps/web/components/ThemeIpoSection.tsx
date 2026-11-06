'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { IpoListItem } from '@investoyard/shared-types';
import {
  stageOf,
  stageLabel,
  toneOf,
  compareForList,
  shortName,
  titleCase,
  demandWord,
  demandTier,
  fmtDateTime,
} from '@investoyard/shared-types';
import * as calc from '@/lib/ipoCalc';
import { fmtDate } from '@/lib/catColor';

/**
 * THE DESIGN'S `#ipos` BLOCK: one section, three views — IPO Calendar,
 * Allotment, Live subscription — with the Table/Cards layout switch living
 * inside the first, where the design puts it.
 *
 * IT IS A WRAPPER, NOT A REPLACEMENT, and that is the whole reason it is cheap.
 * The calendar view IS `IpoExplorer2`, passed in as `children` and mounted
 * ONCE: rendering a second copy for the theme would double the heaviest
 * component on the page and give the two filter states somewhere to disagree.
 * The other two views are tables over the same `ipos` array the explorer
 * already has, so this adds no fetch.
 *
 * THE SWITCH IS HIDDEN BY CSS ON OUR OWN LAYOUT, not by reading `useSite()`.
 * The pre-paint script sets `data-template` during parse, so the control is
 * absent from the first paint on our host rather than appearing and vanishing a
 * tick later — and because the default state is the calendar, our own page
 * renders exactly what it rendered before this component existed.
 *
 * EVERY FIGURE COMES FROM A SHARED RESOLVER. The subscription view reads
 * `subscriptionTable`, never `ipo.subscription[].timesSubscribed`: the stored
 * figure is demand over the GROSS offer while the resolver recomputes against
 * the NET book after deducting the anchor, and printing the raw one here would
 * make this table disagree with the subscription page it links to — the fault
 * that had mobile's hub showing 14.82x against the detail page's 36.74x.
 */

type View = 'calendar' | 'allotment' | 'subscription';

const VIEWS: { id: View; label: string }[] = [
  { id: 'calendar', label: 'IPO Calendar' },
  { id: 'allotment', label: 'Allotment' },
  { id: 'subscription', label: 'Live subscription' },
];

/* The stages where an allotment is a thing that exists or is imminent. An
   upcoming issue has nothing to check and would be a row of dashes. */
const ALLOTMENT_STAGES = ['allotmentout', 'awaiting', 'listed'];

/* ...AND THE ROW MUST ALSO CARRY AN ALLOTMENT DATE, which is the column the
   view is named after. The stage test alone admitted the 20 `awaiting`
   records, most of which are withdrawn or postponed issues from the back
   catalogue with nothing in any column: the first render put two useful rows
   above ten empty ones. 132 of 1,319 records carry a date. */
const hasAllotment = (i: IpoListItem) =>
  ALLOTMENT_STAGES.includes(stageOf(i as any)) && !!(i as any).allotmentDate;

const ROWS = 12;

export function ThemeIpoSection({
  ipos,
  lang = 'en',
  children,
}: {
  ipos: IpoListItem[];
  lang?: string;
  children: React.ReactNode;
}) {
  const [view, setView] = useState<View>('calendar');
  const q = lang !== 'en' ? `?lang=${lang}` : '';

  /* `compareForList` is the house ordering — the open trio collapsed and sorted
     by close date, then Pre Apply, Upcoming, Allotment Out, Awaiting, Listed.
     Sorted once and sliced per view rather than per render. */
  const ranked = useMemo(() => [...ipos].sort(compareForList as any), [ipos]);

  const allotmentRows = useMemo(() => ranked.filter(hasAllotment).slice(0, ROWS), [ranked]);

  /* Issues the exchange has actually given figures for. NOT "open issues", the
     filter `/subscription` uses: nothing is open on most days, and a view whose
     own heading promises subscription would then be permanently empty. The
     footnote states that a closed issue shows its final figures.

     ORDERED BY RECENCY WITHIN THE CLOSED ROWS, because this table answers
     "what are the latest figures" and `compareForList` answers "what should I
     act on". Its `awaiting` bucket is mostly withdrawn and postponed records
     from the back catalogue, which put 2023 issues above four that listed this
     week. Open issues keep their stage rank at the top: a live book outranks
     any finished one however recent. */
  const subsRows = useMemo(() => {
    const withFigures = ranked.filter(
      (i) => Array.isArray((i as any).subscription) && (i as any).subscription.length > 0,
    );
    const isOpen = (i: IpoListItem) => {
      const st = stageOf(i as any);
      return st === 'live' || st === 'opentoday' || st === 'closingtoday';
    };
    const open = withFigures.filter(isOpen);
    const closed = withFigures
      .filter((i) => !isOpen(i))
      /* newest close date first; a record with no close date sorts last rather
         than first, which an empty string would otherwise invert */
      .sort((a, b) => String((b as any).closeDate ?? '').localeCompare(String((a as any).closeDate ?? '')));
    return [...open, ...closed].slice(0, ROWS);
  }, [ranked]);

  /* NO CLASS ON THE WRAPPER BELOW: it needs no box of its own, and a class
     with no rule inherits the base and looks deliberate — the fault
     `st t-live` shipped with. `data-view` stays, because it is what a
     verification pass reads to learn which tab is open. */
  return (
    /* `ipo-views`, NOT a second `#ipos`: the explorer already renders that id
       and the first of two wins. This one is on the wrapper, which is never
       hidden, so the hero's CTA has something to scroll to whatever view is
       open. */
    <div id="ipo-views" data-view={view}>
      <div className="tpl-vw" role="tablist" aria-label="IPO views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className={view === v.id ? 'is-on' : ''}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* The calendar view is the explorer itself, with its own filters and its
          own Table/Cards toggle. Kept MOUNTED when another view is showing
          rather than unmounted, so switching away and back does not discard the
          reader's filters — and `hidden` keeps it out of the accessibility tree
          while it is not the open tab. */}
      <div hidden={view !== 'calendar'}>{children}</div>

      {view === 'allotment' && <AllotmentView rows={allotmentRows} langQuery={q} />}
      {view === 'subscription' && <SubscriptionView rows={subsRows} langQuery={q} />}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The Allotment view — the design's Company / Allotment / Listing / Registrar
 * / Listing gain table.
 *
 * LISTING GAIN IS READ FROM `listingGainPct`, NEVER DERIVED HERE. That
 * derivation already exists in three copies across this codebase and a fourth
 * is how they start disagreeing; the API sets this field from the stored
 * listing price. Measured on the live catalogue: ONE record of 1,319 carries
 * it, so this column is a dimmed dash almost everywhere — which is the
 * operator-data gap, stated rather than hidden, and the house rule is that a
 * pending figure renders a dash rather than making the column disappear.
 *
 * IT KEEPS THE SEMANTIC GREEN AND RED, unlike the premium figures. A listing
 * gain is a REALISED outcome, which is exactly the half of the C2 rule that
 * was left coloured.
 */
function AllotmentView({ rows, langQuery }: { rows: IpoListItem[]; langQuery: string }) {
  if (rows.length === 0) {
    return (
      <div className="tpl-vw-empty">
        <p>No allotments to show yet.</p>
        <p className="tpl-vw-empty-sub">
          An issue appears here once bidding has closed. You can still check any PAN against a
          registrar&rsquo;s own records.
        </p>
        <Link className="btn btn-primary" href={`/allotment/${langQuery}`}>Check an allotment</Link>
      </div>
    );
  }

  return (
    <div className="tpl-vw-body">
      <div className="tpl-vw-scroll">
        <table className="tpl-vw-tbl">
          <thead>
            <tr>
              <th>Company</th>
              <th>Allotment</th>
              <th>Listing</th>
              <th>Registrar</th>
              <th>Listing gain</th>
              <th aria-label="Check" />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const gain = typeof i.listingGainPct === 'number' ? i.listingGainPct : null;
              return (
                <tr key={i.symbol}>
                  <td>
                    <Link
                      className="tpl-vw-nm"
                      href={`/ipos/${i.slug ?? i.symbol}/${langQuery}`}
                      title={titleCase(i.name)}
                    >
                      {shortName(i.name)}
                    </Link>
                    <span className="tpl-vw-sub">
                      <span className={`status t-${toneOf(i as any)}`}>{stageLabel(i as any)}</span>
                      {i.type === 'sme' ? ' SME' : ' Mainboard'}
                    </span>
                  </td>
                  {/* never a dash: `hasAllotment` is what put the row here */}
                  <td data-num>{fmtDate((i as any).allotmentDate)}</td>
                  <td data-num>{(i as any).listingDate ? fmtDate((i as any).listingDate) : <span className="tpl-vw-pend">—</span>}</td>
                  <td>{(i as any).registrar || <span className="tpl-vw-pend">—</span>}</td>
                  <td data-num>
                    {gain == null ? (
                      <span className="tpl-vw-pend">—</span>
                    ) : (
                      <b className={gain >= 0 ? 'tpl-vw-up' : 'tpl-vw-dn'}>
                        {gain >= 0 ? '+' : '−'}
                        {Math.abs(gain).toFixed(2)}%
                      </b>
                    )}
                  </td>
                  <td>
                    <Link className="tpl-vw-act" href={`/allotment/${langQuery}`}>Check</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tpl-vw-note">
        Listing gain compares the issue price with the actual listing price. It is shown only once
        we hold a listing price for that issue.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The Live subscription view — the design's Company / QIB / NII / Retail /
 * Total / Demand table.
 *
 * THE FOOTNOTE IS OURS, NOT THE DESIGN'S. The canvas says "Bids at 4:00 PM
 * from NSE and BSE. Updated every hour while the issue is open." Neither half
 * is true here: the poller runs every 60 seconds inside 10:00-18:00 IST and
 * every 5 seconds through the last ninety minutes, and each row carries its own
 * as-of. Copying a placeholder claim about our own refresh rate would be the
 * same fault as a cover figure promising what the body no longer offers.
 */
function SubscriptionView({ rows, langQuery }: { rows: IpoListItem[]; langQuery: string }) {
  if (rows.length === 0) {
    return (
      <div className="tpl-vw-empty">
        <p>No subscription figures yet.</p>
        <p className="tpl-vw-empty-sub">
          Figures appear once an issue opens and the exchanges begin reporting bids.
        </p>
        <Link className="btn btn-primary" href={`/subscription/${langQuery}`}>Open the subscription hub</Link>
      </div>
    );
  }

  return (
    <div className="tpl-vw-body">
      <div className="tpl-vw-scroll">
        <table className="tpl-vw-tbl">
          <thead>
            <tr>
              <th>Company</th>
              <th>QIB</th>
              <th>NII</th>
              <th>Retail</th>
              <th>Total</th>
              <th>Demand</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              /* NULL when the record has no reservation table, which is the
                 common case across the catalogue — then there is no book to
                 measure demand against and the row says so rather than
                 printing a multiple computed from nothing. */
              const sub = calc.subscriptionTable(i as any);
              const cell = (key: string) => {
                const r = sub?.rows.find((x: any) => x.key === key);
                return r && r.times > 0 ? `${r.times.toFixed(2)}×` : null;
              };
              const total = sub?.total && sub.total.times > 0 ? sub.total.times : null;
              const stage = stageOf(i as any);
              const open = stage === 'live' || stage === 'opentoday' || stage === 'closingtoday';
              return (
                <tr key={i.symbol}>
                  <td>
                    <Link
                      className="tpl-vw-nm"
                      href={`/subscription/v2/?symbol=${i.symbol}`}
                      title={titleCase(i.name)}
                    >
                      {shortName(i.name)}
                    </Link>
                    <span className="tpl-vw-sub">
                      <span className={`status t-${toneOf(i as any)}`}>{stageLabel(i as any)}</span>
                      {(i as any).subscriptionAsOf ? ` ${fmtDateTime((i as any).subscriptionAsOf)}` : ''}
                    </span>
                  </td>
                  {(['qib', 'nii', 'retail'] as const).map((k) => (
                    <td key={k} data-num>{cell(k) ?? <span className="tpl-vw-pend">—</span>}</td>
                  ))}
                  <td data-num>
                    {total == null ? <span className="tpl-vw-pend">—</span> : <b>{total.toFixed(2)}×</b>}
                  </td>
                  <td>
                    {/* `demandWord` is the ONE ladder — Building up / Steady /
                        Strong / Very strong, with thresholds calibrated per
                        board — read by the card, the compare table, the banner
                        and all three mobile surfaces. */}
                    {total == null ? (
                      <span className="tpl-vw-pend">—</span>
                    ) : (
                      <span className={`tpl-vw-dem tier-${demandTier(total, i.type === 'sme')}`}>
                        {demandWord(total, i.type === 'sme')}
                        {!open && <span className="tpl-vw-fin">final</span>}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tpl-vw-note">
        Bids are read from NSE and BSE between 10:00 and 18:00 IST — every minute, and every five
        seconds through the last ninety minutes of an issue. Each row shows when its figures were
        last refreshed; a closed issue shows its final figures. QIB excludes the anchor portion.
      </p>
    </div>
  );
}
