import Link from 'next/link';
import type { DetailModel } from '@/core/models';
import { DLogo, ExtIcon, St, heat, tshade } from './parts';

/*
 * Terminal's issue screen: a quote bar of key figures, then three columns —
 * the subscription matrix, the event log with lots and reservation, and an
 * action column with facts and documents. Company prose sits beneath.
 */
export default function DetailPage({ model: m }: { model: DetailModel }) {
  const c = m.card;
  const listed = c.stage === 'listed';
  const quote: [string, string][] = [
    ['Price band', c.band], ['Lot', m.lot], ['Min. investment', c.min], ['Issue size', c.size],
    ['Subscribed', m.sub ? m.sub.total.times : '—'], ['Face value', m.face || '—'], [listed ? 'Listed' : 'Bidding', listed ? m.listedOn : c.dates],
  ];

  return (
    <div className="t-page" style={{ paddingTop: 0 }}>
      <section className="t-dhead">
        <nav className="t-note" aria-label="Breadcrumb"><Link href="/" className="t-link" style={{ fontWeight: 500 }}>Blotter</Link> / <span className="mono">{c.sym}</span></nav>
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="t-dhead-l">
            <DLogo ipo={c} />
            <div style={{ minWidth: 0 }}>
              <h1>{c.name} IPO</h1>
              <div className="t-dmeta">
                <span className="mono" style={{ color: 'var(--brand-lite)', fontWeight: 600 }}>{c.sym}</span>
                <span>{c.board}</span><span>{m.mechanism}</span><span>{c.exchanges}</span>{m.industry ? <span>{m.industry}</span> : null}
              </div>
            </div>
          </div>
          <St tone={c.tone}>{c.status}</St>
        </div>
        <dl className="t-quote">
          {quote.map(([k, v]) => <div key={k}><dt className="t-label">{k}</dt><dd className="mono" title={v}>{v}</dd></div>)}
        </dl>
      </section>

      <div className="t-dgrid" style={{ marginTop: 0 }}>
        <div className="t-col">
          {m.sub ? (
            <section className="t-panel" id="subscription" aria-labelledby="sub-h">
              <div className="t-ph"><h2 id="sub-h">Subscription matrix</h2><span className="t-label mono">{m.sub.final ? 'Final' : 'Live'}{m.sub.asOf ? ` · ${m.sub.asOf}` : ''}</span></div>
              <div className="t-table-wrap">
                <table className="t-table t-mx">
                  <thead><tr><th>Category</th><th className="r hide-m">Offered</th><th className="r hide-m">Bid for</th><th className="r">Times</th></tr></thead>
                  <tbody>
                    {m.sub.rows.map((r) => (
                      <tr key={r.key} className={r.nested ? 'nested' : ''}>
                        <td>{r.label}</td>
                        <td className="r mono hide-m t-muted">{r.book}</td>
                        <td className="r mono hide-m t-muted">{r.bid}</td>
                        <td className="t-heat mono" style={heat(r.width)}>{r.times}</td>
                      </tr>
                    ))}
                    <tr className="total"><td>Total</td><td className="r mono hide-m">{m.sub.total.book}</td><td className="r mono hide-m">{m.sub.total.bid}</td><td className="t-heat mono">{m.sub.total.times}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="t-pb" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px', borderTop: '1px solid var(--line2)' }}>
                {m.sub.total.applications ? <span><span className="t-label">Applications </span><span className="mono">{m.sub.total.applications}</span></span> : null}
                {m.sub.total.amount !== '—' ? <span><span className="t-label">Bids worth </span><span className="mono">{m.sub.total.amount}</span></span> : null}
              </div>
              <p className="t-note" style={{ padding: '0 14px 14px' }}>{m.sub.anchorNote ? `${m.sub.anchorNote} ` : ''}Times = shares bid for ÷ shares offered.</p>
            </section>
          ) : null}

          {m.qibSplit.length ? (
            <section className="t-panel" aria-labelledby="qib-h">
              <div className="t-ph"><h2 id="qib-h">QIB book by investor</h2></div>
              <div className="t-pb">
                <div className="t-stack" role="img" aria-label={m.qibSplit.map((q) => `${q.label} ${q.pct}%`).join(', ')}>
                  {m.qibSplit.map((q, i) => <span key={q.label} style={{ width: `${q.pct}%`, background: tshade(i) }} />)}
                </div>
                <ul className="t-legend">
                  {m.qibSplit.map((q, i) => <li key={q.label}><i style={{ background: tshade(i) }} /><span>{q.label}</span><span className="mono t-muted">{q.shares}</span><span className="mono">{q.pct}%</span></li>)}
                </ul>
              </div>
            </section>
          ) : null}
        </div>

        <div className="t-col">
          {m.timeline.length ? (
            <section className="t-panel" id="dates" aria-labelledby="tl-h">
              <div className="t-ph"><h2 id="tl-h">Event log</h2></div>
              <ol className="t-tl">
                {m.timeline.map((t) => <li key={t.label}><span className="mono t-muted">{t.date}</span><span>{t.label}</span><span className={t.done ? 'ok' : 'pend'}>{t.done ? 'DONE' : 'DUE'}</span></li>)}
              </ol>
            </section>
          ) : null}

          {m.lots.length ? (
            <section className="t-panel" id="lots" aria-labelledby="lots-h">
              <div className="t-ph"><h2 id="lots-h">Lot sizes</h2><span className="t-label mono">@ {m.upperPrice}</span></div>
              <div className="t-table-wrap">
                <table className="t-table">
                  <thead><tr><th>Category</th><th className="r">Lots</th><th className="r">Shares</th><th className="r">Amount</th></tr></thead>
                  <tbody>{m.lots.map((l) => <tr key={l.cat}><td title={l.sub}>{l.cat}</td><td className="r mono">{l.lots}</td><td className="r mono">{l.shares}</td><td className="r mono">{l.amount}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          ) : null}

          {m.reservation.length ? (
            <section className="t-panel" id="reservation" aria-labelledby="res-h">
              <div className="t-ph"><h2 id="res-h">Reservation</h2></div>
              <div className="t-pb">
                <div className="t-stack" role="img" aria-label={m.reservation.map((r) => `${r.label} ${r.pct}%`).join(', ')}>
                  {m.reservation.map((r, i) => <span key={r.key} style={{ width: `${r.pct}%`, background: tshade(i) }} />)}
                </div>
                <ul className="t-legend">
                  {m.reservation.map((r, i) => <li key={r.key}><i style={{ background: tshade(i) }} /><span>{r.label}</span><span className="mono t-muted">{r.amount}</span><span className="mono">{r.pct}%</span></li>)}
                </ul>
              </div>
            </section>
          ) : null}
        </div>

        <div className="t-col">
          <section className="t-panel" aria-labelledby="act-h">
            <div className="t-ph"><h2 id="act-h">Action</h2><St tone={c.tone}>{c.status}</St></div>
            <p className="t-pb t-note" style={{ color: 'var(--ink2)', fontSize: 13 }}>{m.ctaNote}</p>
            <dl className="t-act-figs">
              <div><dt className="t-label">Price band</dt><dd className="mono">{c.band}</dd></div>
              <div><dt className="t-label">Min. inv.</dt><dd className="mono">{c.min}</dd></div>
            </dl>
            <div className="t-pb" style={{ display: 'grid', gap: 8 }}>
              <Link href="/allotment/" className="t-btn t-btn-p">Check allotment</Link>
              {m.documents[0] ? <a href={m.documents[0].url} target="_blank" rel="noopener noreferrer" className="t-btn t-btn-s">Read the {m.documents[0].label}</a> : null}
            </div>
          </section>

          {m.facts.length ? (
            <section className="t-panel" aria-labelledby="facts-h">
              <div className="t-ph"><h2 id="facts-h">Issue facts</h2></div>
              <dl className="t-dl">{m.facts.map((f) => <div key={f.k}><dt>{f.k}</dt><dd className="mono">{f.v}</dd></div>)}</dl>
            </section>
          ) : null}

          {m.documents.length ? (
            <section className="t-panel" id="documents" aria-labelledby="docs-h">
              <div className="t-ph"><h2 id="docs-h">Documents</h2></div>
              <ul className="t-docs">{m.documents.map((d) => <li key={d.url}><a href={d.url} target="_blank" rel="noopener noreferrer"><span>{d.label}</span><ExtIcon /></a></li>)}</ul>
            </section>
          ) : null}
        </div>
      </div>

      {(m.aboutHtml || m.strengthsHtml || m.financialsHtml) ? (
        <section className="t-panel" id="company" aria-labelledby="co-h">
          <div className="t-ph"><h2 id="co-h">Company</h2></div>
          <div className="t-pb">
            <div className="t-co2">
              {m.aboutHtml ? <div className="t-prose" dangerouslySetInnerHTML={{ __html: m.aboutHtml }} /> : null}
              {m.strengthsHtml ? <div><div className="t-label" style={{ marginBottom: 8 }}>Strengths</div><div className="t-prose" dangerouslySetInnerHTML={{ __html: m.strengthsHtml }} /></div> : null}
            </div>
            {m.financialsHtml ? <><div className="t-label" style={{ margin: '20px 0 6px' }}>Financials · ₹ crore</div><div className="t-prose t-table-wrap" dangerouslySetInnerHTML={{ __html: m.financialsHtml }} /></> : null}
            {m.leads.length ? <p className="t-note" style={{ marginTop: 16 }}><span className="t-label">Lead managers </span>{m.leads.join(', ')}</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
