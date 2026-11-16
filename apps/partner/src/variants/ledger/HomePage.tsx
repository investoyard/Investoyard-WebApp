'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import type { HomeModel, IpoCard } from '@/core/models';
import { dayMonYear, lowerFirst } from '@/core/format';
import { useAllotmentCheck } from '@/core/allotment';
import AllotForm from './AllotForm';
import { Row, State } from './parts';

type Tab = 'all' | 'open' | 'upcoming' | 'closed';
type View = 'cards' | 'list';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'closed', label: 'Closed' },
];

const names = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/*
 * The lede is a sentence built from the register itself, in place of a hero
 * banner: what is open, what opens next. Every clause comes from a field; a
 * state with nothing in it is simply not mentioned.
 */
function Lede({ m }: { m: HomeModel }) {
  const open = m.actionable.filter((c) => c.tone === 'open');
  const next = m.actionable.filter((c) => c.tone === 'upcoming').slice(0, 2);
  return (
    <p className="l-lede">
      {open.length
        ? <><strong>{open.length === 1 ? 'One issue is' : `${open.length} issues are`} open for bidding</strong>: {names(open.map((c) => `${c.name} (${lowerFirst(c.status)})`))}.</>
        : <><strong>No issue is open for bidding.</strong></>}
      {next.length ? <> {next.length === 1 ? 'Next' : 'Next up'}: {names(next.map((c) => `${c.name} ${lowerFirst(c.status)}`))}.</> : null}
      {m.counts.recent ? <> {m.counts.recent} issue{m.counts.recent === 1 ? '' : 's'} listed in the last 45 days.</> : null}
    </p>
  );
}

function Entry({ c }: { c: IpoCard }) {
  return (
    <li className="l-entry">
      <div className="l-entry-top">
        <Link className="l-entry-name" href={c.href}>{c.name}</Link>
        <State tone={c.tone}>{c.status}</State>
      </div>
      <p className="l-entry-meta">{c.board} · {c.exchanges}</p>
      <dl className="l-rows">
        <Row k="Bidding" v={c.dates} />
        <Row k="Price band" v={c.band} />
        <Row k="Minimum investment" v={c.min} />
        <Row k="Issue size" v={c.size} />
        {c.subs ? <Row k={c.tone === 'open' ? 'Subscribed so far' : 'Subscribed, final'} v={c.subs} /> : null}
      </dl>
    </li>
  );
}

function Compact({ rows }: { rows: IpoCard[] }) {
  return (
    <div className="l-table-wrap">
      <table className="l-table">
        <thead>
          <tr>
            <th scope="col">Issue</th>
            <th scope="col" className="r hide-s">Bidding</th>
            <th scope="col" className="r hide-s">Price band</th>
            <th scope="col" className="r hide-s">Min. investment</th>
            <th scope="col" className="r">Subscribed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.sym}>
              <td><Link href={c.href}>{c.name}</Link><small>{c.board} · {c.status}</small></td>
              <td className="r hide-s">{c.dates}</td>
              <td className="r hide-s">{c.band}</td>
              <td className="r hide-s">{c.min}</td>
              <td className="r">{c.subs || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Register({ m }: { m: HomeModel }) {
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<View>('cards');
  const count = (t: Tab) => (t === 'all' ? m.actionable.length : m.actionable.filter((c) => c.tone === t).length);
  const rows = useMemo(() => (tab === 'all' ? m.actionable : m.actionable.filter((c) => c.tone === tab)), [m.actionable, tab]);
  return (
    <section className="l-sec" aria-labelledby="reg-h">
      <div className="l-sec-h">
        <h2 id="reg-h">Current issues</h2>
        <div className="l-ctrl" role="group" aria-label="Layout">
          <button type="button" className="l-opt" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>Cards</button>
          <button type="button" className="l-opt" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
        </div>
      </div>
      <div className="l-bar-ctrl">
        <div className="l-ctrl" role="tablist" aria-label="Filter issues">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" className="l-opt" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}<b>{count(t.key)}</b>
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0
        ? <p className="l-empty">No issue is in this state today. The <Link className="l-link" href="/ipos/">archive</Link> holds every past IPO.</p>
        : view === 'cards' ? <ol className="l-entries">{rows.map((c) => <Entry key={c.sym} c={c} />)}</ol> : <Compact rows={rows} />}
      <p className="l-note">Open, upcoming, and issues still waiting on allotment or listing, in the order they need attention. A dash means the figure is not published yet. <Link className="l-link" href="/ipos/">Every past IPO</Link></p>
    </section>
  );
}

function Listed({ m }: { m: HomeModel }) {
  if (!m.recent.length) return null;
  return (
    <section className="l-sec" aria-labelledby="ls-h">
      <div className="l-sec-h"><h2 id="ls-h">Recently listed</h2><span className="l-label">Last 45 days</span></div>
      <div className="l-table-wrap">
        <table className="l-table">
          <thead><tr><th scope="col">Issue</th><th scope="col" className="r hide-s">Price band</th><th scope="col" className="r">Subscribed</th></tr></thead>
          <tbody>
            {m.recent.slice(0, 12).map((c) => (
              <tr key={c.sym}>
                <td><Link href={c.href}>{c.name}</Link><small>{c.board} · {c.status}</small></td>
                <td className="r hide-s">{c.band}</td>
                <td className="r">{c.subs || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Allotment({ choices }: { choices: HomeModel['allotmentChoices'] }) {
  const a = useAllotmentCheck(choices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };
  if (!choices.length) return null;
  return (
    <section className="l-sec" aria-labelledby="al-h">
      <div className="l-sec-h"><h2 id="al-h">Allotment</h2></div>
      <p className="l-prose" style={{ marginTop: 16 }}>Check the registrar’s file for any applicant, wherever they applied, once the basis of allotment is out.</p>
      <AllotForm a={a} choices={choices} onSubmit={onSubmit} />
    </section>
  );
}

const NOTES: [string, string][] = [
  ['Read the offer.', 'The price band, the dates and the red herring prospectus. Every figure here comes from the exchanges and the offer document.'],
  ['Bid with UPI.', 'Apply through your demat account. The amount is blocked in your bank by UPI mandate, not debited.'],
  ['Check the result.', 'On allotment day. Allotted shares reach your demat before listing; the rest of the block is released.'],
];

export default function HomePage({ model }: { model: HomeModel }) {
  return (
    <div className="l-page">
      <h1>IPO register</h1>
      <p className="l-dateline l-label">As of {dayMonYear(model.asOf)} · Mainboard and SME</p>
      <Lede m={model} />
      <Register m={model} />
      <Listed m={model} />
      <Allotment choices={model.allotmentChoices} />
      <section className="l-sec" aria-labelledby="how-h">
        <div className="l-sec-h"><h2 id="how-h">How an IPO works</h2></div>
        <ol className="l-notes">
          {NOTES.map(([t, d], i) => <li key={t}><span>{i + 1}.</span><p><strong>{t}</strong> {d}</p></li>)}
        </ol>
      </section>
    </div>
  );
}
