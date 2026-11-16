import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DetailModel } from '@/core/models';
import { Arrow, Chip, ExtIcon, shade, shadeInk } from './parts';

/*
 * Horizon's detail page: a full-bleed brand header carrying the figures, then
 * one section per question, each with its heading in a left column. Charts
 * are proportional shapes rather than tables — big bars for subscription,
 * labelled blocks for the reservation — with the exact numbers beside them.
 * A slim action bar stays at the bottom on every width.
 */

function Sec({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="h-dsec" id={id} aria-labelledby={`${id}-h`}>
      <div className="h-wrap h-dsec-grid">
        <div className="h-side">
          <h2 id={`${id}-h`} className="dsp">{title}</h2>
          {note ? <p>{note}</p> : null}
        </div>
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </section>
  );
}

export default function DetailPage({ model: m }: { model: DetailModel }) {
  const c = m.card;
  const closed = c.tone === 'closed';
  const firstDoc = m.documents[0];
  const figs: [string, string][] = [
    ['Price band', c.band],
    ['Min. investment', c.min],
    ['Lot size', m.lot],
    ['Issue size', c.size],
    [m.sub ? (m.sub.final ? 'Subscribed, final' : 'Subscribed so far') : 'Subscription', m.sub ? m.sub.total.times : '—'],
    ['Bidding', c.dates],
  ];
  return (
    <>
      <section className="h-on h-dhero" aria-labelledby="d-h">
        <div className="h-wrap">
          <nav className="h-crumb h-soft" aria-label="Breadcrumb"><Link href="/">IPOs</Link> <span aria-hidden="true">/</span> {c.name}</nav>
          <div className="h-did">
            <div className="h-did-l">
              {c.logo ? <img className="h-dlogo" src={c.logo} alt="" /> : <span className="h-dini" aria-hidden="true">{c.ini}</span>}
              <div style={{ minWidth: 0 }}>
                <h1 id="d-h" className="dsp">{c.name}</h1>
                <p className="h-dmeta h-soft">{[c.board, c.exchanges, m.industry, m.mechanism].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <span className="h-chip h-chip-on"><i aria-hidden="true" />{c.status}</span>
          </div>
          <dl className="h-dfigs">
            {figs.map(([k, v]) => <div key={k}><dt className="h-soft">{k}</dt><dd className="dsp num" title={v}>{v}</dd></div>)}
          </dl>
        </div>
      </section>

      {m.sub ? (
        <Sec id="subscription" title="Subscription" note={m.sub.asOf ? `${m.sub.final ? 'Final figures' : 'Updated'} ${m.sub.asOf}. Bars use a log scale.` : 'Bars use a log scale.'}>
          <div className="h-sub-total">
            <strong className="dsp num">{m.sub.total.times}</strong>
            <span>{m.sub.final ? 'subscribed overall, final' : 'subscribed overall so far'}</span>
          </div>
          <div className="h-bars">
            {m.sub.rows.map((r) => (
              <div key={r.key} className={`h-bar-row${r.nested ? ' nested' : ''}`}>
                <span className="h-bar-l">{r.label}</span>
                <span className="h-bar" aria-hidden="true"><span style={{ width: `${r.width}%` }} /></span>
                <span className="h-bar-v dsp num">{r.times}</span>
              </div>
            ))}
          </div>
          <dl className="h-chips2">
            <div><dt>Shares offered</dt><dd className="num">{m.sub.total.book}</dd></div>
            <div><dt>Shares bid for</dt><dd className="num">{m.sub.total.bid}</dd></div>
            <div><dt>Amount bid</dt><dd className="num">{m.sub.total.amount}</dd></div>
            {m.sub.total.applications ? <div><dt>Applications</dt><dd className="num">{m.sub.total.applications}</dd></div> : null}
          </dl>
          {m.sub.anchorNote ? <p className="h-fine">{m.sub.anchorNote}</p> : null}
          {m.qibSplit.length ? (
            <div style={{ marginTop: 32 }}>
              <h3 className="h-sub3">Inside QIB</h3>
              <ul className="h-blocks-legend">
                {m.qibSplit.map((q, i) => <li key={q.label}><i style={{ background: shade(i) }} aria-hidden="true" />{q.label}<b>{q.pct}%</b></li>)}
              </ul>
            </div>
          ) : null}
        </Sec>
      ) : null}

      {m.timeline.length ? (
        <Sec id="dates" title="Key dates" note="Allotment, refunds and listing follow the T+3 timetable.">
          <ol className="h-track">
            {m.timeline.map((t) => (
              <li key={t.label} className={t.done ? 'done' : undefined}>
                <strong>{t.label}</strong>
                <span className="num">{t.date}</span>
              </li>
            ))}
          </ol>
        </Sec>
      ) : null}

      {m.reservation.length ? (
        <Sec id="reservation" title="Who it’s for" note="How the offer is split between investor categories, as a share of the offer.">
          <div className="h-blocks" aria-hidden="true">
            {m.reservation.map((r, i) => (
              <div key={r.key} className="h-block" style={{ flex: `${Math.max(r.pct, 4)} 1 0`, background: shade(i), color: shadeInk(i) }}>
                {/* A block too narrow for its figure says nothing; the legend below carries every one. */}
                {r.pct >= 7 ? <strong className="dsp num">{r.pct}%</strong> : null}
                {r.pct >= 12 ? <span>{r.label}</span> : null}
              </div>
            ))}
          </div>
          <ul className="h-blocks-legend">
            {m.reservation.map((r, i) => (
              <li key={r.key}><i style={{ background: shade(i) }} aria-hidden="true" />{r.label} · {r.shares} sh<b>{r.pct}%</b></li>
            ))}
          </ul>
        </Sec>
      ) : null}

      {m.lots.length ? (
        <Sec id="lots" title="How much to apply" note={`At the upper price of ${m.upperPrice}.`}>
          <div className="h-lots">
            {m.lots.map((l) => (
              <div key={l.cat} className="h-lot">
                <h3>{l.cat}</h3>
                {l.sub ? <p>{l.sub}</p> : null}
                <strong className="dsp num">{l.amount}</strong>
                <span className="num">{l.lots} lot{l.lots === '1' ? '' : 's'} · {l.shares} shares</span>
              </div>
            ))}
          </div>
        </Sec>
      ) : null}

      {m.aboutHtml ? (
        <Sec id="about" title="The company">
          <div className="h-mag h-prose" dangerouslySetInnerHTML={{ __html: m.aboutHtml }} />
        </Sec>
      ) : null}

      {m.strengthsHtml ? (
        <Sec id="strengths" title="Strengths" note="As stated by the company in its offer document.">
          <div className="h-prose" dangerouslySetInnerHTML={{ __html: m.strengthsHtml }} />
        </Sec>
      ) : null}

      {m.financialsHtml ? (
        <Sec id="financials" title="Financials" note="As stated in the offer document.">
          <div className="h-prose h-scroll" dangerouslySetInnerHTML={{ __html: m.financialsHtml }} />
        </Sec>
      ) : null}

      <Sec id="facts" title="The offer">
        <dl className="h-facts">
          {m.facts.map((f) => <div key={f.k}><dt>{f.k}</dt><dd>{f.v}</dd></div>)}
          {m.leads.length ? <div className="h-facts-wide"><dt>Lead managers</dt><dd>{m.leads.join(', ')}</dd></div> : null}
        </dl>
      </Sec>

      {m.documents.length ? (
        <Sec id="documents" title="Documents">
          <div className="h-docs">
            {m.documents.map((d) => <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer">{d.label} <ExtIcon /></a>)}
          </div>
        </Sec>
      ) : null}

      <div className="h-stick">
        <div className="h-wrap h-stick-in">
          <div style={{ minWidth: 0 }}>
            <div className="h-stick-name">{c.name}</div>
            <div className="h-stick-s">{m.ctaNote}</div>
          </div>
          {closed ? <Link className="h-btn" href="/allotment/">Check allotment <Arrow /></Link>
            : firstDoc ? <a className="h-btn" href={firstDoc.url} target="_blank" rel="noopener noreferrer">Read the {firstDoc.label} <ExtIcon /></a>
              : <Link className="h-btn" href="/subscription/">Subscription <Arrow /></Link>}
        </div>
      </div>
    </>
  );
}
