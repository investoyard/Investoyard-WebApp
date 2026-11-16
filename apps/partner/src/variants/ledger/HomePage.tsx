'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import type { HomeModel, IpoCard } from '@/core/models';
import { dayMonYear, lowerFirst } from '@/core/format';
import { useAllotmentCheck } from '@/core/allotment';
import AllotForm from './AllotForm';
import { State, dayParts, keyDate } from './parts';

type Tab = 'all' | 'open' | 'upcoming' | 'closed';
type View = 'cards' | 'list';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'open', label: 'Open' }, { key: 'upcoming', label: 'Upcoming' }, { key: 'closed', label: 'Closed' },
];
const PAGE = 15;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* One calendar entry: the issue's next date set large in the partner's colour, the issue, and its four figures. */
function Entry({ c, asOf }: { c: IpoCard; asOf: string }) {
  const k = keyDate(c, asOf);
  const dp = k ? dayParts(k.d) : null;
  return (
    <li>
      <div className="l-day">
        {dp ? <><b>{dp.day}</b><span>{dp.mon}</span><small>{k!.label}</small></> : <span>—</span>}
      </div>
      <div style={{ minWidth: 0 }}>
        <Link className="l-entry-name" href={c.href}>{c.name}</Link>
        <div className="l-entry-meta"><State tone={c.tone}>{c.status}</State><span>{c.board} · {c.exchanges}</span></div>
      </div>
      <dl className="l-figs">
        <div><dt>Price band</dt><dd>{c.band}</dd></div>
        <div><dt>Min. invest</dt><dd>{c.min}</dd></div>
        <div><dt>Issue size</dt><dd>{c.size}</dd></div>
        <div><dt>Subscribed</dt><dd>{c.subs || '—'}</dd></div>
      </dl>
    </li>
  );
}

function Table({ rows }: { rows: IpoCard[] }) {
  return (
    <div className="l-table-wrap">
      <table className="l-table">
        <thead>
          <tr><th>Issue</th><th className="hide-s">Status</th><th className="r hide-s">Bidding</th><th className="r hide-s">Price band</th><th className="r hide-s">Min. invest</th><th className="r">Subscribed</th></tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.sym}>
              <td><Link className="l-tname" href={c.href}>{c.name}</Link><small>{c.board} · {c.exchanges}</small></td>
              <td className="hide-s"><State tone={c.tone}>{c.status}</State></td>
              <td className="r hide-s">{c.dates}</td>
              <td className="r hide-s">{c.band}</td>
              <td className="r hide-s">{c.min}</td>
              <td className="r"><b>{c.subs || '—'}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HomePage({ model }: { model: HomeModel }) {
  const all = useMemo(() => [...model.actionable, ...model.recent], [model]);
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<View>('cards');
  const [showAll, setShowAll] = useState(false);
  const a = useAllotmentCheck(model.allotmentChoices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };

  const count = (t: Tab) => (t === 'all' ? all.length : all.filter((c) => c.tone === t).length);
  const rows = useMemo(() => (tab === 'all' ? all : all.filter((c) => c.tone === tab)), [all, tab]);
  const shown = showAll ? rows : rows.slice(0, PAGE);
  const next = model.actionable.find((c) => c.tone === 'upcoming');
  const med = median(model.recent.map((c) => c.subsN).filter((v): v is number => v != null));

  return (
    <div className="l-page">
      <p className="l-label">As of {dayMonYear(model.asOf)}</p>
      <h1 className="l-h1" style={{ marginTop: 10 }}>IPO calendar</h1>
      <p className="l-lede">
        Every mainboard and SME issue in one schedule — what is open, what opens next, and what has just listed — with the figures the exchanges publish.
      </p>

      <dl className="l-metrics">
        <div><dt>Open for bidding</dt><dd>{model.counts.open}</dd><small>{model.counts.open ? 'Bidding now' : 'Nothing bidding today'}</small></div>
        <div><dt>Upcoming</dt><dd>{model.counts.upcoming}</dd><small>{next ? `${next.name} ${lowerFirst(next.status)}` : 'None announced'}</small></div>
        <div><dt>Listed in 45 days</dt><dd>{model.counts.recent}</dd><small>Mainboard and SME</small></div>
        <div><dt>Median subscription</dt><dd>{med != null ? `${med.toFixed(2)}×` : '—'}</dd><small>Recent listings</small></div>
      </dl>

      <section className="l-sec" aria-labelledby="cal-h">
        <div className="l-sec-h">
          <div><h2 id="cal-h">Schedule</h2><p>Each issue is filed under the next date that matters to it.</p></div>
          <div className="l-toggle" role="group" aria-label="Layout">
            <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>Cards</button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
          </div>
        </div>
        <div className="l-bar-ctrl">
          <div className="l-tabs" role="tablist" aria-label="Filter issues">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" className="l-tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setShowAll(false); }}>
                {t.label}<b className="num">{count(t.key)}</b>
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0
          ? <div className="l-empty"><strong>Nothing here today</strong>No issue is in this state right now. The <Link className="l-link" href="/ipos/">archive</Link> holds every past IPO.</div>
          : view === 'cards' ? <ol className="l-cal">{shown.map((c) => <Entry key={c.sym} c={c} asOf={model.asOf} />)}</ol> : <Table rows={shown} />}
        <div className="l-more">
          <span className="l-muted num">{shown.length} of {rows.length}</span>
          <span style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {rows.length > PAGE ? <button type="button" className="l-btn l-btn-q" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${rows.length}`}</button> : null}
            <Link className="l-link" href="/ipos/">Every past IPO</Link>
          </span>
        </div>
      </section>

      <section className="l-sec l-two" aria-label="Allotment and how an IPO works">
        <div className="l-card">
          <h2 className="serif" style={{ fontSize: 24, fontWeight: 600 }}>Check your allotment</h2>
          <p className="l-muted" style={{ margin: '4px 0 18px', fontSize: 14.5 }}>Works for any applicant, wherever they applied, once the registrar publishes.</p>
          {model.allotmentChoices.length ? <AllotForm a={a} choices={model.allotmentChoices} onSubmit={onSubmit} /> : <p className="l-muted">No IPO has closed in the last 90 days.</p>}
        </div>
        <div className="l-card">
          <h2 className="serif" style={{ fontSize: 24, fontWeight: 600 }}>How an IPO works</h2>
          <ol className="l-how" style={{ marginTop: 10 }}>
            <li><span>1</span><div><strong>Read the offer</strong><p>Price band, dates and the red herring prospectus. Every figure here comes from the exchanges and the offer document.</p></div></li>
            <li><span>2</span><div><strong>Bid with UPI</strong><p>Apply through your demat account. The amount is blocked in your bank by UPI mandate, not debited.</p></div></li>
            <li><span>3</span><div><strong>Check the result</strong><p>On allotment day. Allotted shares reach your demat before listing; the rest of the block is released.</p></div></li>
          </ol>
        </div>
      </section>
    </div>
  );
}
