import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DetailModel } from '@/core/models';
import { Bar, ExtIcon, Row, State } from './parts';

/*
 * A research note on one issue: title block, the key-figure strip, then the
 * report itself with an "On this page" index beside it. Sections read top to
 * bottom like a document; figures sit in tables and on dotted leaders.
 */

type Sec = { id: string; title: string; body: ReactNode };

export default function DetailPage({ model: m }: { model: DetailModel }) {
  const c = m.card;
  const closed = c.tone === 'closed';
  const firstDoc = m.documents[0];
  const secs: Sec[] = [];

  if (m.sub) {
    const s = m.sub;
    secs.push({
      id: 'subscription', title: 'Subscription', body: (
        <>
          <div className="l-total">
            <strong>{s.total.times}</strong>
            <span className="l-muted">{s.final ? 'subscribed overall, final' : 'subscribed overall so far'}{s.asOf ? ` · ${s.final ? 'as of' : 'updated'} ${s.asOf}` : ''}</span>
          </div>
          <div className="l-table-wrap">
            <table className="l-table">
              <thead><tr><th>Category</th><th className="r hide-s">Shares offered</th><th className="r hide-s">Shares bid for</th><th style={{ width: '26%' }}><span className="sr">Demand</span></th><th className="r">Times</th></tr></thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.key} className={r.nested ? 'nested' : undefined}>
                    <td>{r.label}</td><td className="r hide-s">{r.book}</td><td className="r hide-s">{r.bid}</td><td><Bar width={r.width} /></td><td className="r"><b>{r.times}</b></td>
                  </tr>
                ))}
                <tr className="total"><td>Total</td><td className="r hide-s">{s.total.book}</td><td className="r hide-s">{s.total.bid}</td><td /><td className="r">{s.total.times}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="l-note">Amount bid {s.total.amount}{s.total.applications ? ` · ${s.total.applications} applications` : ''}. {s.anchorNote ? `${s.anchorNote} ` : ''}Bars use a log scale.</p>
          {m.qibSplit.length ? (
            <dl className="l-rows" style={{ marginTop: 16 }}>
              {m.qibSplit.map((q) => <Row key={q.label} k={<>Inside QIB · {q.label}</>} v={`${q.pct}%`} />)}
            </dl>
          ) : null}
        </>
      ),
    });
  }
  if (m.timeline.length) {
    secs.push({
      id: 'dates', title: 'Key dates', body: (
        <ol className="l-steps">
          {m.timeline.map((t) => <li key={t.label} className={t.done ? 'done' : undefined}><b>{t.label}</b><span>{t.date}</span></li>)}
        </ol>
      ),
    });
  }
  if (m.reservation.length) {
    const max = Math.max(1, ...m.reservation.map((r) => r.pct));
    secs.push({
      id: 'reservation', title: 'Who the offer is for', body: (
        <ul className="l-res">
          {m.reservation.map((r) => (
            <li key={r.key}><span>{r.label}<small>{r.shares} shares</small></span><Bar width={Math.round((r.pct / max) * 100)} /><b>{r.pct}%</b></li>
          ))}
        </ul>
      ),
    });
  }
  if (m.lots.length) {
    secs.push({
      id: 'lots', title: 'How much to apply', body: (
        <>
          <div className="l-table-wrap">
            <table className="l-table">
              <thead><tr><th>Category</th><th className="r">Lots</th><th className="r hide-s">Shares</th><th className="r">Amount</th></tr></thead>
              <tbody>{m.lots.map((l) => <tr key={l.cat}><td>{l.cat}{l.sub ? <small>{l.sub}</small> : null}</td><td className="r">{l.lots}</td><td className="r hide-s">{l.shares}</td><td className="r"><b>{l.amount}</b></td></tr>)}</tbody>
            </table>
          </div>
          <p className="l-note">At the upper price of {m.upperPrice}.</p>
        </>
      ),
    });
  }
  if (m.aboutHtml) secs.push({ id: 'company', title: 'The company', body: <div className="l-prose" dangerouslySetInnerHTML={{ __html: m.aboutHtml }} /> });
  if (m.strengthsHtml) secs.push({ id: 'strengths', title: 'Strengths, as stated by the company', body: <div className="l-prose" dangerouslySetInnerHTML={{ __html: m.strengthsHtml }} /> });
  if (m.financialsHtml) secs.push({ id: 'financials', title: 'Financials', body: <div className="l-prose l-scroll" style={{ maxWidth: 'none' }} dangerouslySetInnerHTML={{ __html: m.financialsHtml }} /> });
  secs.push({
    id: 'offer', title: 'The offer', body: (
      <dl className="l-rows">
        {m.facts.map((f) => <Row key={f.k} k={f.k} v={f.v} />)}
        {m.leads.length ? <Row k="Lead managers" v={m.leads.join(', ')} wrap /> : null}
      </dl>
    ),
  });
  if (m.documents.length) {
    secs.push({ id: 'documents', title: 'Documents', body: <div className="l-docs">{m.documents.map((d) => <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer">{d.label} <ExtIcon /></a>)}</div> });
  }

  return (
    <article className="l-page">
      <nav className="l-crumb" aria-label="Breadcrumb"><Link href="/">IPO calendar</Link> / {c.name}</nav>
      <div className="l-dhead">
        {c.logo ? <img className="l-dlogo" src={c.logo} alt="" /> : <span className="l-dini" aria-hidden="true">{c.ini}</span>}
        <div style={{ minWidth: 0 }}>
          <h1 className="l-h1">{c.name}</h1>
          <div className="l-dmeta"><State tone={c.tone}>{c.status}</State><span>{[c.board, c.exchanges, m.industry].filter(Boolean).join(' · ')}</span></div>
        </div>
      </div>

      <dl className="l-metrics">
        <div><dt>Price band</dt><dd style={{ fontSize: 26 }}>{c.band}</dd><small>Lot of {m.lot}</small></div>
        <div><dt>Minimum investment</dt><dd style={{ fontSize: 26 }}>{c.min}</dd><small>At the upper price</small></div>
        <div><dt>Issue size</dt><dd style={{ fontSize: 26 }}>{c.size}</dd><small>{m.mechanism}</small></div>
        <div><dt>Subscribed</dt><dd style={{ fontSize: 26 }}>{m.sub ? m.sub.total.times : '—'}</dd><small>{m.sub ? (m.sub.final ? 'Final' : 'So far') : `Bidding ${c.dates}`}</small></div>
      </dl>

      <div className="l-dbody">
        <nav className="l-toc" aria-label="On this page">
          <span className="l-label">On this page</span>
          {secs.map((s) => <a key={s.id} href={`#${s.id}`}>{s.title.replace(', as stated by the company', '')}</a>)}
        </nav>
        <div className="l-dsecs">
          {secs.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
              <h2 id={`${s.id}-h`}>{s.title}</h2>
              {s.body}
            </section>
          ))}
          <div className="l-cta">
            <p>{m.ctaNote}</p>
            {closed ? <Link className="l-btn" href="/allotment/">Check allotment</Link>
              : firstDoc ? <a className="l-btn" href={firstDoc.url} target="_blank" rel="noopener noreferrer">Read the {firstDoc.label}</a>
                : <Link className="l-btn" href="/subscription/">Live subscription</Link>}
          </div>
        </div>
      </div>
    </article>
  );
}
