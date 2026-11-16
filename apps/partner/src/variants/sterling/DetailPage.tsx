import Link from 'next/link';
import type { DetailModel } from '@/core/models';
import { Bar, DocIcon, External, Logo, Status, shade } from './parts';

export default function DetailPage({ model: m }: { model: DetailModel }) {
  const c = m.card;
  const listed = c.stage === 'listed';
  const figs: [string, string][] = [
    ['Issue size', c.size],
    ['Price band', c.band],
    ['Lot size', m.lot],
    ['Min. investment', c.min],
    [m.sub ? 'Subscribed' : 'Bidding', m.sub ? m.sub.total.times : c.dates],
    [m.face ? 'Face value' : 'Board', m.face || c.board],
  ];
  const sections: [string, string, boolean][] = [
    ['dates', 'Key dates', m.timeline.length > 0],
    ['subscription', 'Subscription', !!m.sub],
    ['reservation', 'Reservation', m.reservation.length > 0],
    ['lots', 'Lot sizes', m.lots.length > 0],
    ['company', 'Company', !!(m.aboutHtml || m.strengthsHtml || m.financialsHtml)],
    ['details', 'Issue details', m.facts.length > 0],
    ['documents', 'Documents', m.documents.length > 0],
  ];

  return (
    <>
      <section className="s-dhead">
        <div className="s-dhead-in">
          <nav className="s-crumb" aria-label="Breadcrumb">
            <Link href="/">IPOs</Link><span aria-hidden="true">/</span><span style={{ color: 'var(--ink2)' }}>{c.name}</span>
          </nav>
          <div className="s-did">
            <div className="s-did-l">
              <Logo ipo={c} size="xl" />
              <div style={{ minWidth: 0 }}>
                <h1 className="s-dh1">{c.name} IPO</h1>
                <p className="s-note" style={{ marginTop: 10, fontSize: 15 }}>
                  {[c.board, m.mechanism, c.exchanges, m.industry].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <span className="s-pill"><Status tone={c.tone}>{c.status}</Status></span>
          </div>
          <dl className="s-figs">
            {figs.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd title={v}>{v}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <nav className="s-subnav" aria-label="On this page">
        <div className="s-wrap">
          {sections.filter((s) => s[2]).map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </div>
      </nav>

      <div className="s-wrap s-dbody">
        <div style={{ minWidth: 0 }}>
          {m.timeline.length > 0 && (
            <section id="dates" className="s-dsec">
              <div className="s-dsec-h">
                <h2 className="s-h3">Key dates</h2>
                <span className="s-note">{m.timeline.every((t) => t.done) ? 'All milestones complete' : 'As announced in the offer document'}</span>
              </div>
              <ol className="s-tl">
                {m.timeline.map((t) => (
                  <li key={t.label} className={t.done ? 'done' : ''}>
                    <div className="s-tl-line"><span className="s-tl-dot" /><span className="s-tl-bar" /></div>
                    <div className="s-tl-k">{t.label}</div>
                    <div className="s-tl-v">{t.date}</div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {m.sub && (
            <section id="subscription" className="s-dsec">
              <div className="s-dsec-h">
                <h2 className="s-h3">Subscription</h2>
                {m.sub.asOf ? <span className="s-note num">{m.sub.final ? 'Final' : 'Updated'} · {m.sub.asOf}</span> : null}
              </div>
              <div className="s-subhead">
                <div>
                  <div className="s-big">{m.sub.total.times}</div>
                  <div className="s-note" style={{ marginTop: 10, fontSize: 15 }}>subscribed overall, NSE and BSE combined</div>
                </div>
                <dl className="s-subhead-r">
                  {m.sub.total.applications ? <div className="s-kv"><dt>Applications</dt><dd>{m.sub.total.applications}</dd></div> : null}
                  {m.sub.total.amount !== '—' ? <div className="s-kv"><dt>Bids worth</dt><dd>{m.sub.total.amount}</dd></div> : null}
                </dl>
              </div>
              <table className="s-dt">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="r hide-m">Shares offered</th>
                    <th className="r hide-m">Shares bid for</th>
                    <th style={{ width: '36%', paddingLeft: 28 }}>Subscribed</th>
                  </tr>
                </thead>
                <tbody>
                  {m.sub.rows.map((r) => (
                    <tr key={r.key} className={r.nested ? 'nested' : ''}>
                      <td>{r.label}</td>
                      <td className="r num hide-m" style={{ color: 'var(--ink2)' }}>{r.book}</td>
                      <td className="r num hide-m" style={{ color: 'var(--ink2)' }}>{r.bid}</td>
                      <td style={{ paddingLeft: 28 }}><span className="s-subs"><Bar width={r.width} /><b>{r.times}</b></span></td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total</td>
                    <td className="r num hide-m">{m.sub.total.book}</td>
                    <td className="r num hide-m">{m.sub.total.bid}</td>
                    <td style={{ paddingLeft: 28, textAlign: 'right' }} className="num"><b style={{ fontSize: 16 }}>{m.sub.total.times}</b></td>
                  </tr>
                </tbody>
              </table>
              <p className="s-fine">
                {m.sub.anchorNote ? `${m.sub.anchorNote} ` : ''}Times subscribed = shares bid for ÷ shares offered in that category.
              </p>

              {m.qibSplit.length > 0 && (
                <div className="s-box">
                  <div className="s-dsec-h">
                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>Who bid in the QIB book</h3>
                    <span className="s-note" style={{ fontSize: 13 }}>Share of QIB bids by investor type</span>
                  </div>
                  <div className="s-stack" role="img" aria-label={m.qibSplit.map((q) => `${q.label} ${q.pct}%`).join(', ')}>
                    {m.qibSplit.map((q, i) => <span key={q.label} style={{ width: `${q.pct}%`, background: shade(i) }} />)}
                  </div>
                  <ul className="s-legend">
                    {m.qibSplit.map((q, i) => (
                      <li key={q.label}>
                        <div className="s-legend-k"><span className="s-sw" style={{ background: shade(i) }} />{q.label}</div>
                        <div className="num" style={{ marginTop: 6, fontSize: 20, fontWeight: 600 }}>{q.pct}%</div>
                        <div className="num s-note" style={{ marginTop: 2, fontSize: 13 }}>{q.shares} shares</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {m.reservation.length > 0 && (
            <section id="reservation" className="s-dsec">
              <div className="s-dsec-h">
                <h2 className="s-h3">Reservation</h2>
                <span className="s-note">How the issue is split between investor categories</span>
              </div>
              <div className="s-stack" style={{ marginTop: 28 }} role="img" aria-label="Issue reservation by category">
                {m.reservation.map((r, i) => <span key={r.key} style={{ width: `${r.pct}%`, background: shade(i) }} />)}
              </div>
              <table className="s-dt" style={{ marginTop: 20 }}>
                <thead><tr><th>Category</th><th className="r">Share of issue</th><th className="r hide-m">Shares</th><th className="r">Amount</th></tr></thead>
                <tbody>
                  {m.reservation.map((r, i) => (
                    <tr key={r.key}>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="s-sw" style={{ background: shade(i) }} />{r.label}</span></td>
                      <td className="r num">{r.pct}%</td>
                      <td className="r num hide-m" style={{ color: 'var(--ink2)' }}>{r.shares}</td>
                      <td className="r num" style={{ color: 'var(--ink2)' }}>{r.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {m.lots.length > 0 && (
            <section id="lots" className="s-dsec">
              <div className="s-dsec-h">
                <h2 className="s-h3">Lot sizes</h2>
                <span className="s-note">At the upper price of {m.upperPrice}</span>
              </div>
              <table className="s-dt" style={{ marginTop: 20 }}>
                <thead><tr><th>Category</th><th className="hide-m">Application size</th><th className="r">Lots</th><th className="r hide-m">Shares</th><th className="r">Amount</th></tr></thead>
                <tbody>
                  {m.lots.map((l) => (
                    <tr key={l.cat}>
                      <td style={{ fontWeight: 600 }}>{l.cat}</td>
                      <td className="hide-m" style={{ color: 'var(--muted)' }}>{l.sub}</td>
                      <td className="r num">{l.lots}</td>
                      <td className="r num hide-m">{l.shares}</td>
                      <td className="r num">{l.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {(m.aboutHtml || m.strengthsHtml || m.financialsHtml) && (
            <section id="company" className="s-dsec">
              <h2 className="s-h3">About the company</h2>
              {m.aboutHtml ? <div className="s-prose" dangerouslySetInnerHTML={{ __html: m.aboutHtml }} /> : null}
              {m.strengthsHtml ? (<><h3 className="s-h4">Strengths</h3><div className="s-prose" dangerouslySetInnerHTML={{ __html: m.strengthsHtml }} /></>) : null}
              {m.financialsHtml ? (<><h3 className="s-h4">Financials <span className="s-note" style={{ fontWeight: 400, fontSize: 13 }}>₹ crore</span></h3><div className="s-prose" style={{ maxWidth: 'none', overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: m.financialsHtml }} /></>) : null}
            </section>
          )}

          {m.facts.length > 0 && (
            <section id="details" className="s-dsec">
              <h2 className="s-h3">Issue details</h2>
              <dl className="s-facts">
                {m.facts.map((f) => <div key={f.k}><dt>{f.k}</dt><dd className="num">{f.v}</dd></div>)}
              </dl>
              {m.leads.length > 0 && (
                <div style={{ marginTop: 28 }}>
                  <div className="s-note">Book running lead managers</div>
                  <p style={{ marginTop: 8, fontSize: 15, lineHeight: 1.7, color: 'var(--ink2)' }}>{m.leads.join(', ')}</p>
                </div>
              )}
            </section>
          )}

          {m.documents.length > 0 && (
            <section id="documents" className="s-dsec">
              <h2 className="s-h3">Documents</h2>
              <ul className="s-docs">
                {m.documents.map((d) => (
                  <li key={d.url}>
                    <a href={d.url} target="_blank" rel="noopener noreferrer">
                      <span className="s-doc-ic"><DocIcon /></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{d.label}</span>
                        <span className="s-note" style={{ display: 'block', marginTop: 2, fontSize: 13 }}>{hostOf(d.url)}</span>
                      </span>
                      <External />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="s-aside" aria-label="Summary">
          <div className="s-panel">
            <div className="s-panel-h">
              <Status tone={c.tone}>{c.status}</Status>
              <p className="s-note" style={{ marginTop: 6, lineHeight: 1.55 }}>{m.ctaNote}</p>
            </div>
            <dl>
              <div><dt>Price band</dt><dd>{c.band}</dd></div>
              <div><dt>Min. investment</dt><dd>{c.min}</dd></div>
              <div><dt>Lot size</dt><dd>{m.lot}</dd></div>
              {listed ? <div><dt>Listed on</dt><dd>{m.listedOn}</dd></div> : <div><dt>Bidding</dt><dd>{c.dates}</dd></div>}
            </dl>
            <div className="s-panel-a">
              <Link className="s-btn s-btn-p" href="/allotment/">Check allotment</Link>
              {m.documents[0] ? <a className="s-btn s-btn-s" href={m.documents[0].url} target="_blank" rel="noopener noreferrer">Read the {m.documents[0].label}</a> : null}
            </div>
          </div>
          <p className="s-fine" style={{ padding: '0 4px' }}>Figures as published by NSE and BSE. This page informs and is not investment advice.</p>
        </aside>
      </div>
    </>
  );
}

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Document'; }
}
