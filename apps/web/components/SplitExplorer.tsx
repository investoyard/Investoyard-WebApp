'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { useTenant } from '@/components/TenantProvider';
import {
  LABEL, shortName, titleCase, stageOf, stageLabel, toneOf,
  demandWord, type IpoListItem,
} from '@investoyard/shared-types';
import type { Lang } from '@investoyard/i18n';

/**
 * The "list and detail" layout's IPO surface — pick one on the left, read it on
 * the right. Sir's 2b: "Best for advisors and research-led brokers."
 *
 * WHY IT IS A SEPARATE COMPONENT WHERE THE OTHER TWO LAYOUTS ARE CSS. The
 * broker, dashboard and landing templates rearrange sections and resize a hero,
 * which `order` and a few font sizes do. A master/detail is not an arrangement
 * of the card grid — it needs SELECTION, which CSS cannot hold.
 *
 * AND IT IS SERVER-RENDERED, WHICH TOOK A DESIGN DECISION TO GET. It lives in
 * the DOM on every home page alongside the card grid, and CSS shows exactly one
 * — keyed on `data-template`, which the pre-paint script sets during parse. So
 * on a `detail` host the two panes are correctly laid out in the FIRST paint
 * rather than reflowing after hydration, and a crawler reads the whole
 * catalogue either way.
 *
 * THE SELECTION DEFAULTS TO INDEX 0 ON BOTH SIDES, deliberately: the server has
 * no session and no idea what the reader wants, so it picks the first — and
 * `useState(0)` means the client's first render is byte-identical. Any other
 * default (a stored symbol, a query param read at render) would be a hydration
 * mismatch, and React's answer to one is to throw away the server tree.
 *
 * EVERY FIGURE COMES OFF THE LIST ITEM THE EXPLORER ALREADY HAS. No second
 * fetch, no `getIpoDetail` per click: the enriched list carries the band, the
 * lot, the dates and the subscription, which is what a selection list is for.
 * Anything deeper is one click away on the IPO's own page, and the pane says so
 * rather than pretending to be that page.
 */
export function SplitExplorer({ ipos, lang }: { ipos: IpoListItem[]; lang: Lang }) {
  const [sel, setSel] = useState(0);
  const gmpOn = useTenant().flags.gmpEnabled;
  if (!ipos.length) return null;

  const pick = ipos[Math.min(sel, ipos.length - 1)]!;
  const q = lang === 'en' ? '' : `?lang=${lang}`;
  const href = (i: IpoListItem) => `/ipos/${i.slug ?? i.symbol}/${q}`;

  return (
    <div className="tpl-split">
      {/* ---- the list ---- */}
      <div className="tpl-split-list" role="listbox" aria-label="IPOs">
        {ipos.map((i, n) => {
          const stage = stageOf(i as any);
          const on = n === Math.min(sel, ipos.length - 1);
          return (
            <button
              key={i.id}
              type="button"
              role="option"
              aria-selected={on}
              className={`tpl-split-row${on ? ' is-on' : ''} t-${toneOf(i as any)}`}
              onClick={() => setSel(n)}
            >
              <span className="tpl-split-row-t">
                <span className="tpl-split-nm" title={titleCase(i.name)}>{shortName(i.name)}</span>
                <span className="st tpl-split-st">{stageLabel(i as any)}</span>
              </span>
              <span className="tpl-split-row-b">
                <span className="tpl-split-brd">{i.type === 'sme' ? 'SME' : 'Mainboard'}</span>
                {i.subscriptionTimes != null && i.subscriptionTimes > 0 && (
                  <span className="tpl-split-sub">
                    {i.subscriptionTimes.toFixed(2)}×
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {/* The archive link lives INSIDE the card grid, which this template
            hides — so without this, 2b offered sixteen issues out of the whole
            catalogue and no way to reach the rest. One destination, not a
            "view more" ladder, matching the grid's own choice. */}
        <Link className="tpl-split-all" href="/ipos/archive">
          Browse all IPOs
          <Icon name="arrow-right" size={14} aria-hidden />
        </Link>
      </div>

      {/* ---- the detail ---- */}
      <div className="tpl-split-pane" aria-live="polite">
        <div className="tpl-split-head">
          <span className={`st tpl-split-st t-${toneOf(pick as any)}`}>{stageLabel(pick as any)}</span>
          <h3 className="tpl-split-h">{titleCase(pick.name)}</h3>
          <p className="tpl-split-meta">
            {pick.symbol} · {pick.type === 'sme' ? 'SME' : 'Mainboard'}
          </p>
        </div>

        <dl className="tpl-split-kv">
          <Kv k="Offer Price" v={band(pick)} />
          <Kv k="Lot Size" v={pick.lotSize ? `${fmt(pick.lotSize)} shares` : '—'} />
          <Kv k="Min Application" v={pick.minAmount ? `₹${fmt(pick.minAmount)}` : '—'} />
          <Kv k="Issue Size" v={issueSizeOf(pick)} />
          <Kv k="Key Dates" v={dates(pick.openDate, pick.closeDate)} />
          <Kv
            k="Subscribed"
            v={pick.subscriptionTimes != null && pick.subscriptionTimes > 0
              ? `${pick.subscriptionTimes.toFixed(2)}× · ${demandWord(pick.subscriptionTimes, pick.type === 'sme')}`
              : '—'}
          />
          {/* GATED ON THE TENANT FLAG, like the other eight surfaces that show
              a premium. `registerTenant` sets `gmpEnabled: false` and LOCKS it
              for a white-label, and this layout's whole audience IS those
              tenants — so rendering it unconditionally would show a grey-market
              figure on exactly the sites the operator switched it off for.
              Indicative, so it is never in a gain colour and always carries its
              sign, the same rule every other surface follows. */}
          {gmpOn && (
            <Kv
              k={LABEL.gmp}
              v={pick.gmp != null ? `${pick.gmp > 0 ? '+' : pick.gmp < 0 ? '−' : ''}₹${fmt(Math.abs(pick.gmp))}` : '—'}
            />
          )}
        </dl>

        <div className="tpl-split-act">
          <Link className="btn btn-primary" href={href(pick)}>
            Full details
            <Icon name="arrow-right" size={15} aria-hidden />
          </Link>
          <Link className="btn btn-ghost" href={`/allotment${q}`}>Check allotment</Link>
        </div>
        <p className="tpl-split-note">
          Dates, reservation and the full live subscription breakdown are on the issue&apos;s own page.
        </p>
      </div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="tpl-split-kv-i">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('en-IN');

const band = (i: IpoListItem): string => {
  const a = i.priceBandMin, b = i.priceBandMax;
  if (a == null && b == null) return '—';
  if (a != null && b != null && a !== b) return `₹${fmt(a)} – ₹${fmt(b)}`;
  return `₹${fmt((a ?? b)!)}`;
};

/**
 * The list endpoint serves `issueSize` ALREADY FORMATTED — "₹30,213 Cr" — so it
 * is printed as given and never put through Number(), which is NaN on all of
 * them. The featured panel shipped a dash for exactly that reason.
 */
const issueSizeOf = (i: IpoListItem): string => {
  const v = (i as any).issueSize;
  if (typeof v === 'string' && v.trim()) return v;
  const cr = (i as any).issueSizeCr;
  return typeof cr === 'number' && cr > 0 ? `₹${cr.toLocaleString('en-IN')} Cr` : '—';
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Mirrors `fmtRange` on the card: the year once, the month once when shared. */
const dates = (open?: string, close?: string): string => {
  const p = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? { y: +s.slice(0, 4), m: +s.slice(5, 7) - 1, d: +s.slice(8, 10) } : null);
  const a = p(open), b = p(close);
  const f = (x: { y: number; m: number; d: number }) => `${x.d} ${MON[x.m]} ${x.y}`;
  if (!a && !b) return '—';
  if (!a || !b) return f(a ?? b!);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MON[b.m]} ${b.y}`;
  return `${a.d} ${MON[a.m]} – ${b.d} ${MON[b.m]} ${b.y}`;
};
