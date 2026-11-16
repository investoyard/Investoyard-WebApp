import Link from 'next/link';
import type { DetailModel } from '@/core/models';
import { Chip, Doc, Logo, Meter, Tick, shade } from './parts';

/*
 * Bento's issue page: one hero tile, a row of KPI tiles, then a bento grid of
 * section tiles that packs itself (grid-auto-flow: dense), so an issue missing
 * a section never leaves a hole. Reservation is a donut, not a bar.
 */
export default function DetailPage({ model: m }: { model: DetailModel }) {
  const c = m.card;
  const listed = c.stage === 'listed';
  const kpis: [string, string][] = [
    ['Issue size', c.size], ['Price band', c.band], ['Lot size', m.lot], ['Min. investment', c.min],
    [m.sub ? 'Subscribed' : 'Bidding', m.sub ? m.sub.total.times : c.dates], [m.face ? 'Face value' : 'Board', m.face || c.board],
  ];

  let acc = 0;
  const stops = m.reservation.map((r, i) => { const a = acc; acc += r.pct; return `${shade(i)} ${a}% ${acc}%`; });
  if (acc < 100 && stops.length) stops.push(`#eceef4 ${acc}% 100%`);
  const donut = stops.length ? `conic-gradient(${stops.join(', ')})` : undefined;
  const rhp = m.documents[0];

  return (
    <div className="b-page">
      <section className="b-dhero">
        <nav className="b-crumb" aria-label="Breadcrumb"><Link href="/">IPOs</Link><span aria-hidden="true">/</span><span>{c.name}</span></nav>
        <div className="b-dhero-top">
          <div className="b-dhero-l">
            <Logo ipo={c} size="xl" />
            <div style={{ minWidth: 0 }}>
              <h1 className="disp">{c.name} IPO</h1>
              <div className="b-tags">
                {[c.board, m.mechanism, c.exchanges, m.industry].filter(Boolean).map((t) => <span key={t as string} className="b-tag">{t}</span>)}
              </div>
            </div>
          </div>
          <Chip tone={c.tone}>{c.status}</Chip>
        </div>
      </section>

      <dl className="b-kpis">
        {kpis.map(([k, v]) => <div key={k} className="b-kpi"><dt>{k}</dt><dd className="disp" title={v}>{v}</dd></div>)}
      </dl>

      <div className="b-grid">
        {m.sub && (
          <section id="subscription" className="b-tile b-s8">
            <div className="b-tile-h"><h2 className="b-h3 disp">Subscription</h2>{m.sub.asOf ? <span className="b-k num">{m.sub.final ? 'Final' : 'Updated'} · {m.sub.asOf}</span> : null}</div>
            <div className="b-subtop">
              <div>
                <div className="b-big disp">{m.sub.total.times}</div>
                <div className="b-k" style={{ marginTop: 8, fontSize: 14 }}>subscribed overall, NSE and BSE combined</div>
              </div>
              <dl className="b-subtop-r">
                {m.sub.total.applications ? <div><dt>Applications</dt><dd>{m.sub.total.applications}</dd></div> : null}
                {m.sub.total.amount !== '—' ? <div><dt>Bids worth</dt><dd>{m.sub.total.amount}</dd></div> : null}
              </dl>
            </div>
            <ul className="b-cats">
              {m.sub.rows.map((r) => (
                <li key={r.key} className={`b-cat${r.nested ? ' nested' : ''}`}>
                  <div className="b-cat-l"><span>{r.label}</span><strong>{r.times}</strong></div>
                  <Meter width={r.width} />
                </li>
              ))}
            </ul>
            <p className="b-fine">{m.sub.anchorNote ? `${m.sub.anchorNote} ` : ''}Times subscribed = shares bid for ÷ shares offered in that category.</p>
          </section>
        )}

        <aside className="b-s4 b-act" aria-label="Summary">
          <div className="b-tile">
            <Chip tone={c.tone}>{c.status}</Chip>
            <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.55, color: 'var(--ink2)' }}>{m.ctaNote}</p>
            <dl style={{ marginTop: 16 }}>
              <div><dt>Price band</dt><dd>{c.band}</dd></div>
              <div><dt>Min. investment</dt><dd>{c.min}</dd></div>
              <div><dt>Lot size</dt><dd>{m.lot}</dd></div>
              <div><dt>{listed ? 'Listed on' : 'Bidding'}</dt><dd>{listed ? m.listedOn : c.dates}</dd></div>
            </dl>
            <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
              <Link href="/allotment/" className="b-btn b-btn-p">Check allotment</Link>
              {rhp ? <a href={rhp.url} target="_blank" rel="noopener noreferrer" className="b-btn b-btn-s">Read the {rhp.label}</a> : null}
            </div>
          </div>
          <p className="b-fine" style={{ marginTop: 0, padding: '0 8px' }}>Figures as published by NSE and BSE. This page informs and is not investment advice.</p>
        </aside>

        {m.timeline.length > 0 && (
          <section id="dates" className="b-tile b-s4">
            <h2 className="b-h3 disp">Key dates</h2>
            <ol className="b-steps">
              {m.timeline.map((t) => (
                <li key={t.label} className={t.done ? 'done' : ''}>
                  <div className="b-steps-rail"><span className="b-steps-dot">{t.done ? <Tick /> : null}</span><span className="b-steps-line" /></div>
                  <div className="b-steps-txt"><span>{t.label}</span><strong>{t.date}</strong></div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {m.reservation.length > 0 && (
          <section id="reservation" className="b-tile b-s8">
            <h2 className="b-h3 disp">Reservation</h2>
            <p className="b-k" style={{ marginTop: 4 }}>How the issue is split between investor categories</p>
            <div className="b-donut-wrap">
              <div className="b-donut" style={{ background: donut }} role="img" aria-label={m.reservation.map((r) => `${r.label} ${r.pct}%`).join(', ')}>
                <div className="b-donut-c"><div><strong>{c.size}</strong><span>issue size</span></div></div>
              </div>
              <ul className="b-legend">
                {m.reservation.map((r, i) => (
                  <li key={r.key}><i style={{ background: shade(i) }} /><span>{r.label}<small className="num">{r.shares} shares · {r.amount}</small></span><strong>{r.pct}%</strong></li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {m.lots.length > 0 && (
          <section id="lots" className="b-tile b-s5">
            <h2 className="b-h3 disp">Lot sizes</h2>
            <p className="b-k" style={{ marginTop: 4 }}>At the upper price of {m.upperPrice}</p>
            <div className="b-lots">
              {m.lots.map((l) => (
                <div key={l.cat} className="b-lot">
                  <strong>{l.cat}</strong><b>{l.amount}</b>
                  <span>{l.sub}</span><span className="num" style={{ textAlign: 'right' }}>{l.lots} lots · {l.shares} sh</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {m.qibSplit.length > 0 && (
          <section className="b-tile b-s7">
            <h2 className="b-h3 disp">Who bid in the QIB book</h2>
            <p className="b-k" style={{ marginTop: 4 }}>Share of QIB bids by investor type</p>
            <div className="b-split">
              {m.qibSplit.map((q, i) => (
                <div key={q.label}><i style={{ background: shade(i) }} /><strong className="disp">{q.pct}%</strong><span>{q.label}</span></div>
              ))}
            </div>
          </section>
        )}

        {(m.aboutHtml || m.strengthsHtml || m.financialsHtml) && (
          <section id="company" className="b-tile b-s8">
            <h2 className="b-h3 disp">About the company</h2>
            {m.aboutHtml ? <div className="b-prose" dangerouslySetInnerHTML={{ __html: m.aboutHtml }} /> : null}
            {m.strengthsHtml ? <><h3 className="b-h4">Strengths</h3><div className="b-prose" dangerouslySetInnerHTML={{ __html: m.strengthsHtml }} /></> : null}
            {m.financialsHtml ? <><h3 className="b-h4">Financials <span className="b-k" style={{ fontWeight: 400 }}>₹ crore</span></h3><div className="b-prose" style={{ overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: m.financialsHtml }} /></> : null}
          </section>
        )}

        {/* Details and documents share one column, so documents never sit alone on a row. */}
        {(m.facts.length > 0 || m.documents.length > 0) && (
        <div className="b-s4" style={{ display: 'grid', gap: 16, minWidth: 0 }}>
        {m.facts.length > 0 && (
          <section className="b-tile">
            <h2 className="b-h3 disp">Issue details</h2>
            <dl className="b-facts">{m.facts.map((f) => <div key={f.k}><dt>{f.k}</dt><dd className="num">{f.v}</dd></div>)}</dl>
            {m.leads.length ? <><h3 className="b-h4">Lead managers</h3><p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: 'var(--ink2)' }}>{m.leads.join(', ')}</p></> : null}
          </section>
        )}

        {m.documents.length > 0 && (
          <section id="documents" className="b-tile">
            <h2 className="b-h3 disp">Documents</h2>
            <div className="b-docs">
              {m.documents.map((d) => <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer"><span className="b-doc-ic"><Doc /></span>{d.label}</a>)}
            </div>
          </section>
        )}
        </div>
        )}
      </div>

      {/* Phone: the action stays in reach above the tab bar. */}
      <div className="b-actbar">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{c.status}</div>
          <strong className="num" style={{ fontSize: 15 }}>{c.band}</strong>
        </div>
        <Link href="/allotment/" className="b-btn b-btn-p">Check allotment</Link>
      </div>
    </div>
  );
}
