import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DetailModel } from '@/core/models';
import { Mini, Row, State } from './parts';

/*
 * Ledger's detail page is one document: a heading, one sentence saying where
 * the issue stands, a contents line, then numbered sections — figures on
 * leaders, prose as prose. Numbering is used because the contents line
 * refers to the sections by number; nothing else is decoration.
 */

type Sec = { id: string; title: string; body: ReactNode };

export default function DetailPage({ model: m }: { model: DetailModel }) {
  const c = m.card;
  const closed = c.tone === 'closed';
  const firstDoc = m.documents[0];

  const secs: Sec[] = [];
  secs.push({
    id: 'offer', title: 'The offer', body: (
      <dl className="l-rows" style={{ marginTop: 10 }}>
        <Row k="Price band" v={c.band} />
        <Row k="Lot size" v={m.lot} />
        <Row k="Minimum investment" v={c.min} />
        <Row k="Issue size" v={c.size} />
        <Row k="Bidding" v={c.dates} />
        {m.facts.filter((f) => f.k !== 'Lot size').map((f) => <Row key={f.k} k={f.k} v={f.v} />)}
        {m.leads.length ? <Row k="Lead managers" v={m.leads.join(', ')} wrap /> : null}
      </dl>
    ),
  });
  if (m.sub) {
    const s = m.sub;
    secs.push({
      id: 'subscription', title: 'Subscription', body: (
        <>
          <div className="l-total">
            <strong>{s.total.times}</strong>
            <span className="l-muted">{s.final ? 'subscribed overall, final' : 'subscribed overall so far'}{s.asOf ? ` · ${s.final ? 'as of' : 'updated'} ${s.asOf}` : ''}</span>
          </div>
          <ul className="l-subrows">
            {s.rows.map((r) => (
              <li key={r.key} className={r.nested ? 'nested' : undefined}>
                <span className="l-sub-k">{r.label}</span>
                <Mini width={r.width} />
                <span className="l-sub-v">{r.times}</span>
              </li>
            ))}
          </ul>
          <dl className="l-rows" style={{ marginTop: 18 }}>
            <Row k="Shares offered" v={s.total.book} />
            <Row k="Shares bid for" v={s.total.bid} />
            <Row k="Amount bid" v={s.total.amount} />
            {s.total.applications ? <Row k="Applications" v={s.total.applications} /> : null}
          </dl>
          {s.anchorNote ? <p className="l-note">{s.anchorNote} Bars use a log scale.</p> : <p className="l-note">Bars use a log scale.</p>}
          {m.qibSplit.length ? (
            <>
              <h3 className="l-label" style={{ marginTop: 26 }}>Inside QIB</h3>
              <dl className="l-rows">{m.qibSplit.map((q) => <Row key={q.label} k={q.label} v={`${q.pct}%`} />)}</dl>
            </>
          ) : null}
        </>
      ),
    });
  }
  if (m.timeline.length) {
    secs.push({
      id: 'dates', title: 'Key dates', body: (
        <dl className="l-rows" style={{ marginTop: 10 }}>
          {m.timeline.map((t) => <Row key={t.label} k={<>{t.label}{t.done ? <span className="l-muted"> · done</span> : null}</>} v={t.date} />)}
        </dl>
      ),
    });
  }
  if (m.reservation.length) {
    secs.push({
      id: 'reservation', title: 'Reservation', body: (
        <dl className="l-rows" style={{ marginTop: 10 }}>
          {m.reservation.map((r) => <Row key={r.key} k={r.label} v={<>{r.pct}% <span className="l-muted">· {r.shares} sh</span></>} />)}
        </dl>
      ),
    });
  }
  if (m.lots.length) {
    secs.push({
      id: 'lots', title: 'How much to apply', body: (
        <>
          <p className="l-note" style={{ marginTop: 12 }}>At the upper price of {m.upperPrice}.</p>
          <dl className="l-rows">
            {m.lots.map((l) => <Row key={l.cat} k={<>{l.cat}{l.sub ? <span className="l-muted"> · {l.sub}</span> : null}</>} v={<>{l.amount} <span className="l-muted">· {l.lots} lot{l.lots === '1' ? '' : 's'}</span></>} />)}
          </dl>
        </>
      ),
    });
  }
  if (m.aboutHtml) secs.push({ id: 'company', title: 'The company', body: <div className="l-prose" dangerouslySetInnerHTML={{ __html: m.aboutHtml }} /> });
  if (m.strengthsHtml) secs.push({ id: 'strengths', title: 'Strengths, as stated by the company', body: <div className="l-prose" dangerouslySetInnerHTML={{ __html: m.strengthsHtml }} /> });
  if (m.financialsHtml) secs.push({ id: 'financials', title: 'Financials', body: <div className="l-prose l-scroll" dangerouslySetInnerHTML={{ __html: m.financialsHtml }} /> });
  if (m.documents.length) {
    secs.push({
      id: 'documents', title: 'Documents', body: (
        <ul className="l-docs" style={{ marginTop: 6 }}>
          {m.documents.map((d) => <li key={d.url}><a href={d.url} target="_blank" rel="noopener noreferrer">{d.label}</a><span className="l-label">Opens in a new tab</span></li>)}
        </ul>
      ),
    });
  }

  return (
    <article className="l-page l-detail">
      <nav className="l-crumb" aria-label="Breadcrumb"><Link href="/">Register</Link> / {c.name}</nav>
      <h1>{c.name}</h1>
      <p className="l-dateline"><State tone={c.tone}>{c.status}</State></p>
      <p className="l-lede">
        {c.legal}: a {c.board.toLowerCase()}, {m.mechanism.toLowerCase().replace(' ', '-')} issue on {c.exchanges}{m.industry ? ` (${m.industry})` : ''}. {m.ctaNote}
      </p>
      <nav className="l-toc" aria-label="Contents">
        {secs.map((s, i) => <a key={s.id} href={`#${s.id}`}><span>{i + 1}</span>{s.title.replace(', as stated by the company', '')}</a>)}
      </nav>
      {secs.map((s, i) => (
        <section key={s.id} id={s.id} className="l-sec" aria-labelledby={`${s.id}-h`}>
          <div className="l-sec-h"><h2 id={`${s.id}-h`}><span className="mono">{i + 1}</span>{s.title}</h2></div>
          {s.body}
        </section>
      ))}
      <div className="l-end">
        <p>{m.ctaNote}</p>
        {closed ? <Link className="l-btn" href="/allotment/">Check allotment</Link>
          : firstDoc ? <a className="l-btn" href={firstDoc.url} target="_blank" rel="noopener noreferrer">Read the {firstDoc.label}</a>
            : <Link className="l-btn" href="/subscription/">Subscription</Link>}
      </div>
    </article>
  );
}
