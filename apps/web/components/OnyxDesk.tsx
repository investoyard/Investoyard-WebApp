'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { IpoListItem } from '@investoyard/shared-types';
import {
  stageOf,
  stageLabel,
  toneOf,
  compareForList,
  shortName,
  titleCase,
  issueSizeLabel,
} from '@investoyard/shared-types';
import { getIpos } from '@/lib/api';
import * as calc from '@/lib/ipoCalc';
import { fmtDate } from '@/lib/catColor';

/**
 * ONYX'S OWN WAY OF PRESENTING THE CATALOGUE — a desk blotter, not a card
 * grid.
 *
 * WHY IT IS A SEPARATE COMPONENT AND NOT A DEFAULT VIEW ON THE SHARED ONE.
 * `ThemeIpoSection` picks its view with `useState`, and the theme is only
 * known from `data-template` on the html element, which the SERVER cannot
 * read — a static export answers every host with one set of HTML. Reading it
 * in an effect would paint the card grid and swap it a tick later, and
 * reading it in a state initialiser is a hydration mismatch. So Onyx gets its
 * own markup and CSS shows one, exactly as the three headers do.
 *
 * AND IT IS WHAT THE THEME IS FOR. The operator's complaint was that every
 * theme presented the data identically; a trading desk does not read a grid
 * of cards with a logo plate and a status ring in each. It reads rows: one
 * line per issue, figures right-aligned in tabular numerals, the whole
 * catalogue legible without scrolling past artwork.
 *
 * NO FETCH IS ADDED. It is handed the same `ipos` array the explorer already
 * has, and every derived figure comes from a shared resolver — `stageOf` for
 * the status, `compareForList` for the order, `calc.subscriptionTable` for
 * the multiple. The subscription figure is NEVER read off
 * `ipo.subscription[].timesSubscribed`: the stored value is demand over the
 * GROSS offer while the resolver recomputes against the NET book after
 * deducting the anchor, and printing the raw one would make this table
 * disagree with the subscription page it links to.
 */

type Filter = 'all' | 'open' | 'upcoming' | 'closed';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'closed', label: 'Closed' },
];

/* The stages each filter admits. Spelt out rather than inferred from a
   status string, because `Ipo.status` is dead — every row says `upcoming`
   until `enrich` overwrites it — and the stage engine is the one answer. */
const OPEN_STAGES = new Set(['live', 'opentoday', 'closingtoday']);
const AHEAD_STAGES = new Set(['upcoming', 'preapply']);

/* `subscriptionTable` returns { rows, total, ... } or null — the total is a
   field on it, not a row to find. Null is the ordinary answer for an issue
   with no reservation table, which is most of the catalogue. */
function totalTimes(ipo: IpoListItem): number | null {
  const sub = calc.subscriptionTable(ipo as never);
  const t = sub?.total;
  return t && t.times > 0 ? t.times : null;
}

export function OnyxDesk({ ipos, langQuery }: { ipos: IpoListItem[]; langQuery: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  /* THE BAKED LIST IS A DAY OLD AT WORST and this table is the whole page on
     this theme, so it refreshes on mount exactly as the explorer does.
     `getIpos` shares ONE promise per page in the browser, so the hidden
     explorer and this table cost a single request between them rather than
     2.8 MB each. An empty or failed response leaves the baked rows alone -
     stale figures beat an empty desk. */
  const [live, setLive] = useState<IpoListItem[] | null>(null);
  useEffect(() => {
    getIpos().then((r) => { if (Array.isArray(r) && r.length) setLive(r as IpoListItem[]); }).catch(() => {});
  }, []);
  const source = live ?? ipos;

  const rows = useMemo(() => {
    const ranked = [...source].sort(compareForList as never);
    const needle = q.trim().toLowerCase();
    return ranked.filter((ipo) => {
      const id = stageOf(ipo as never) as string;
      if (filter === 'open' && !OPEN_STAGES.has(id)) return false;
      if (filter === 'upcoming' && !AHEAD_STAGES.has(id)) return false;
      if (filter === 'closed' && (OPEN_STAGES.has(id) || AHEAD_STAGES.has(id))) return false;
      if (!needle) return true;
      return `${ipo.name ?? ''} ${ipo.symbol ?? ''}`.toLowerCase().includes(needle);
    }).slice(0, 40);
  }, [source, filter, q]);

  return (
    <section className="onx-desk" aria-label="IPO desk">
      <div className="onx-desk-bar">
        <h2 className="onx-desk-h">IPO desk</h2>
        <div className="onx-desk-f" role="group" aria-label="Filter issues">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={filter === f.id ? 'is-on' : ''}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >{f.label}</button>
          ))}
        </div>
        {/* AN aria-label, NOT A VISUALLY-HIDDEN SPAN: this sheet has no
            `.sr-only` utility — the first draft used one and it rendered as
            plain visible text beside the field, which is what a class that is
            used and never defined always does. */}
        <div className="onx-desk-q">
          <input
            type="search"
            value={q}
            aria-label="Search company or symbol"
            placeholder="Search company or symbol"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="onx-desk-empty">No issues match that filter.</p>
      ) : (
        <div className="onx-desk-wrap">
          <table className="onx-desk-tbl">
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col">Company</th>
                <th scope="col">Board</th>
                <th scope="col">Window</th>
                <th scope="col" className="num">Band</th>
                <th scope="col" className="num">Lot</th>
                <th scope="col" className="num">Size</th>
                <th scope="col" className="num">Subs</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ipo) => {
                const times = totalTimes(ipo);
                const band = ipo.priceBandMin && ipo.priceBandMax
                  ? `${ipo.priceBandMin}–${ipo.priceBandMax}`
                  : ipo.priceBandMin ? String(ipo.priceBandMin) : null;
                const win = ipo.openDate && ipo.closeDate
                  ? `${fmtDate(String(ipo.openDate).slice(0, 10))} – ${fmtDate(String(ipo.closeDate).slice(0, 10))}`
                  : null;
                return (
                  <tr key={ipo.symbol}>
                    <td className="sym">
                      <Link href={`/ipos/${ipo.symbol}${langQuery}`}>{ipo.symbol}</Link>
                    </td>
                    <td className="nm" title={titleCase(ipo.name || '')}>{shortName(ipo.name || '')}</td>
                    <td className="brd">{ipo.type === 'sme' ? 'SME' : 'Mainboard'}</td>
                    <td className="win">{win || <span className="dash">—</span>}</td>
                    <td className="num">{band ? `₹${band}` : <span className="dash">—</span>}</td>
                    <td className="num">{ipo.lotSize || <span className="dash">—</span>}</td>
                    {/* already formatted by the API ("₹48 Cr") — a second
                        rupee sign here would print two */}
                    <td className="num">{issueSizeLabel(ipo as never) || <span className="dash">—</span>}</td>
                    <td className="num">
                      {times != null ? `${times.toFixed(2)}×` : <span className="dash">—</span>}
                    </td>
                    <td>
                      <span className={`st t-${toneOf(ipo as never)}`}>{stageLabel(ipo as never)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="onx-desk-more">
        <Link href={`/ipos/archive${langQuery}`}>Browse the full catalogue →</Link>
      </p>
    </section>
  );
}
