import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DetailModel } from '@/core/models';
import { Bar, ExtIcon, Logo, St, tshade } from './parts';

/*
 * A platform's instrument page: a header card carrying the six figures, a
 * sticky section bar, the main column of panels, and a summary card pinned on
 * the right with the next action. Panels, not prose sections — the reader
 * jumps to the one they need.
 */

function Panel({ id, title, right, children, pad = true }: { id: string; title: string; right?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <section id={id} className="t-panel" aria-labelledby={`${id}-h`}>
      <div className="t-ph"><h2 id={`${id}-h`}>{title}</h2>{right}</div>
      {pad ? <div className="t-pb">{children}</div> : children}
    </section>
  );
}

export default function DetailPage({ model: m }: { model: DetailModel }) {
  const c = m.card;
  const closed = c.tone === 'closed';
  const firstDoc = m.documents[0];
  const figs: [string, string][] = [
    ['Price band', c.band], ['Min. investment', c.min], ['Lot size', m.lot], ['Issue size', c.size],
    [m.sub ? (m.sub.final ? 'Subscribed (final)' : 'Subscribed so far') : 'Subscribed', m.sub ? m.sub.total.times : '—'],
    ['Bidding', c.dates],
  ];
  const tabs: [string, string, boolean][] = [
    ['subscription', 'Subscription', !!m.sub], ['dates', 'Key dates', m.timeline.length > 0],
    ['reservation', 'Reservation', m.reservation.length > 0], ['lots', 'How much to apply', m.lots.length > 0],
    ['company', 'Company', !!m.aboutHtml], ['financials', 'Financials', !!m.financialsHtml],
    ['offer', 'The offer', true], ['documents', 'Documents', m.documents.length > 0],
  ];

  return (
    <div className="t-page">
      <nav className="t-crumb" aria-label="Breadcrumb"><Link href="/">Market</Link> / {c.name}</nav>
      <header className="t-dhead">
        <div className="t-dhead-top">
          <div className="t-did">
            <Logo ipo={c} />
            <div style={{ minWidth: 0 }}>
              <h1>{c.name}</h1>
              <p>{[c.sym, c.board, c.exchanges, m.industry].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <St tone={c.tone}>{c.status}</St>
        </div>
        <dl className="t-dfigs">
          {figs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd title={v}>{v}</dd></div>)}
        </dl>
      </header>

      <nav className="t-dtabs" aria-label="Sections">
        {tabs.filter((t) => t[2]).map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      <div className="t-dgrid">
        <div className="t-dmain">
          {m.sub ? (
            <Panel id="subscription" title="Subscription" pad={false}
              right={<span className="t-muted" style={{ fontSize: 13 }}>{m.sub.asOf ? `${m.sub.final ? 'Final' : 'Updated'} ${m.sub.asOf}` : ''}</span>}>
              <div className="t-pb">
                <div className="t-big"><strong>{m.sub.total.times}</strong><span className="t-muted">subscribed overall{m.sub.final ? ', final' : ' so far'}</span></div>
              </div>
              <div className="t-table-wrap">
                <table className="t-table t-subt">
                  <thead>
                    <tr><th>Category</th><th className="r t-d1">Shares offered</th><th className="r">Shares bid for</th><th className="t-d1" style={{ width: '28%' }}><span className="sr">Demand</span></th><th className="r">Times</th></tr>
                  </thead>
                  <tbody>
                    {m.sub.rows.map((r) => (
                      <tr key={r.key} className={r.nested ? 'nested' : undefined}>
                        <td>{r.label}</td><td className="r t-d1">{r.book}</td><td className="r">{r.bid}</td><td className="t-d1"><Bar width={r.width} /></td><td className="r"><b>{r.times}</b></td>
                      </tr>
                    ))}
                    <tr><td><b>Total</b></td><td className="r t-d1"><b>{m.sub.total.book}</b></td><td className="r"><b>{m.sub.total.bid}</b></td><td className="t-d1" /><td className="r"><b>{m.sub.total.times}</b></td></tr>
                  </tbody>
                </table>
              </div>
              <div className="t-pb">
                <p className="t-muted" style={{ fontSize: 13 }}>
                  Amount bid {m.sub.total.amount}{m.sub.total.applications ? ` · ${m.sub.total.applications} applications` : ''}. {m.sub.anchorNote ? `${m.sub.anchorNote} ` : ''}Bars use a log scale.
                </p>
                {m.qibSplit.length ? (
                  <>
                    <p className="t-muted" style={{ fontSize: 12, fontWeight: 600, marginTop: 14 }}>Inside QIB</p>
                    <ul className="t-legend">
                      {m.qibSplit.map((q, i) => <li key={q.label}><i style={{ background: tshade(i) }} aria-hidden="true" /><span>{q.label}</span><b>{q.pct}%</b></li>)}
                    </ul>
                  </>
                ) : null}
              </div>
            </Panel>
          ) : null}

          {m.timeline.length ? (
            <Panel id="dates" title="Key dates">
              <ol className="t-track">
                {m.timeline.map((t) => <li key={t.label} className={t.done ? 'done' : undefined}><b>{t.label}</b><span>{t.date}</span></li>)}
              </ol>
            </Panel>
          ) : null}

          {m.reservation.length ? (
            <Panel id="reservation" title="Reservation">
              <div className="t-stack" aria-hidden="true">
                {m.reservation.map((r, i) => <span key={r.key} style={{ flex: `${r.pct} 1 0`, background: tshade(i) }} />)}
              </div>
              <ul className="t-legend">
                {m.reservation.map((r, i) => <li key={r.key}><i style={{ background: tshade(i) }} aria-hidden="true" /><span>{r.label} · {r.shares} sh</span><b>{r.pct}%</b></li>)}
              </ul>
            </Panel>
          ) : null}

          {m.lots.length ? (
            <Panel id="lots" title="How much to apply" right={<span className="t-muted" style={{ fontSize: 13 }}>At {m.upperPrice}</span>} pad={false}>
              <div className="t-table-wrap">
                <table className="t-table t-subt t-lots">
                  <thead><tr><th>Category</th><th className="r">Lots</th><th className="r">Shares</th><th className="r">Amount</th></tr></thead>
                  <tbody>
                    {m.lots.map((l) => <tr key={l.cat}><td>{l.cat}{l.sub ? <span className="t-co-sub"> · {l.sub}</span> : null}</td><td className="r">{l.lots}</td><td className="r">{l.shares}</td><td className="r"><b>{l.amount}</b></td></tr>)}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}

          {m.aboutHtml ? <Panel id="company" title="The company"><div className="t-prose" dangerouslySetInnerHTML={{ __html: m.aboutHtml }} /></Panel> : null}
          {m.strengthsHtml ? <Panel id="strengths" title="Strengths, as stated by the company"><div className="t-prose" dangerouslySetInnerHTML={{ __html: m.strengthsHtml }} /></Panel> : null}
          {m.financialsHtml ? <Panel id="financials" title="Financials"><div className="t-prose t-scroll" dangerouslySetInnerHTML={{ __html: m.financialsHtml }} /></Panel> : null}

          <Panel id="offer" title="The offer" pad={false}>
            <dl className="t-dl">
              {m.facts.map((f) => <div key={f.k}><dt>{f.k}</dt><dd>{f.v}</dd></div>)}
              {m.leads.length ? <div><dt>Lead managers</dt><dd style={{ fontWeight: 500 }}>{m.leads.join(', ')}</dd></div> : null}
            </dl>
          </Panel>

          {m.documents.length ? (
            <Panel id="documents" title="Documents">
              <div className="t-docs">
                {m.documents.map((d) => <a key={d.url} className="t-btn" href={d.url} target="_blank" rel="noopener noreferrer">{d.label} <ExtIcon /></a>)}
              </div>
            </Panel>
          ) : null}
        </div>

        <aside className="t-panel t-sidecard" aria-label="Issue summary">
          <div className="t-pane-head">
            <div className="t-pane-name">{c.name}</div>
            <St tone={c.tone}>{c.status}</St>
          </div>
          <dl className="t-dl">
            <div><dt>Price band</dt><dd>{c.band}</dd></div>
            <div><dt>Min. investment</dt><dd>{c.min}</dd></div>
            <div><dt>Lot size</dt><dd>{m.lot}</dd></div>
            <div><dt>Listing on</dt><dd>{c.exchanges}</dd></div>
          </dl>
          <div className="t-pane-act">
            <p className="t-muted" style={{ fontSize: 13 }}>{m.ctaNote}</p>
            {closed ? <Link className="t-btn t-btn-p" href="/allotment/">Check allotment</Link>
              : firstDoc ? <a className="t-btn t-btn-p" href={firstDoc.url} target="_blank" rel="noopener noreferrer">Read the {firstDoc.label}</a>
                : <Link className="t-btn t-btn-p" href="/subscription/">Live subscription</Link>}
            <Link className="t-btn" href="/">Back to market</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
