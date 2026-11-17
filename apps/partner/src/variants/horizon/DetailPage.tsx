import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DetailModel } from '@/core/models';
import Countdown from './Countdown';
import ReadMore from './ReadMore';
import DetailTabs from './DetailTabs';
import { Arrow, ExtIcon, Icon, Logo, Status, shade, targetOf, type IconName } from './parts';

/*
 * Horizon's IPO page, after the reference: an identity header with the
 * countdown, a row of tabs, then three columns of cards — the company and its
 * subscription on the left, the offer in the middle, dates, documents and the
 * registrar on the right. Server-rendered; only the countdown runs in the
 * browser.
 */

function Card({ id, title, icon, note, children }: { id: string; title: string; icon?: IconName; note?: string; children: ReactNode }) {
  return (
    <section className="h-card h-dcard" id={id} aria-labelledby={`${id}-h`}>
      <div className="h-dcard-h">
        <h2 id={`${id}-h`} className="h-h3">{icon ? <Icon name={icon} size={20} /> : null}{title}</h2>
        {note ? <span className="h-note">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

export default function DetailPage({ model: m }: { model: DetailModel }) {
  const c = m.card;
  const target = targetOf(c);
  const rhp = m.documents[0];
  const val = (k: string) => m.facts.find((f) => f.k === k)?.v;
  const highlights: [IconName, string, string | undefined][] = [
    ['building', 'Issue size', c.size !== '—' ? c.size : undefined],
    ['coins', 'Fresh issue', val('Fresh issue')],
    ['users', 'Offer for sale', val('Offer for sale')],
    ['tag', 'Price band', c.band !== '—' ? c.band : undefined],
    ['layers', 'Lot size', m.lot !== '—' ? m.lot : undefined],
    ['chart', 'Issue type', m.mechanism],
    ['rupee', 'Face value', val('Face value')],
    ['bank', 'Listing on', c.exchanges],
    ['doc', 'ISIN', val('ISIN')],
  ];
  const tabs: [string, string][] = [['overview', 'Overview']];
  if (m.sub) tabs.push(['subscription', 'Subscription']);
  if (m.reservation.length) tabs.push(['reservation', 'Reservation']);
  if (m.financialsHtml) tabs.push(['financials', 'Financials']);
  if (m.objects.length) tabs.push(['objects', 'Objects of issue']);
  if (m.documents.length) tabs.push(['documents', 'Documents']);
  if (m.registrarInfo) tabs.push(['registrar', 'Registrar']);

  return (
    <>
      <div className="h-dtop">
        <div className="h-wrap">
          <nav className="h-crumb" aria-label="Breadcrumb">
            <Link href="/" aria-label="Home"><Icon name="home" size={15} /></Link><span aria-hidden="true">›</span>
            <Link href="/">IPOs</Link><span aria-hidden="true">›</span><span>{c.name}</span>
          </nav>
          <div className="h-dhead">
            <div className="h-dlogo"><Logo ipo={c} size="lg" /></div>
            <div className="h-did">
              <div className="h-did-t"><h1 className="h-h1 h-h1-d">{c.legal}</h1><Status tone={c.tone}>{c.status}</Status></div>
              <p className="h-did-m">{[m.industry, c.board, c.exchanges].filter(Boolean).join(' • ')}</p>
              {c.blurb ? <p className="h-did-b">{c.blurb}</p> : null}
            </div>
            <div className="h-dside">
              {target ? <div className="h-dcd"><Countdown at={target.at} label={target.label} /></div>
                : m.sub ? <div className="h-dcd h-dcd-sub"><p className="h-cd-l"><Icon name="chart" size={18} />{m.sub.final ? 'Subscribed, final' : 'Subscribed so far'}</p><strong className="num">{m.sub.total.times}</strong></div>
                  : null}
              <div className="h-dact">
                {c.tone === 'closed'
                  ? <Link className="h-btn h-btn-p" href="/allotment/">Check allotment <Arrow /></Link>
                  : rhp ? <a className="h-btn h-btn-p" href={rhp.url} target="_blank" rel="noopener noreferrer">Read the {rhp.label} <ExtIcon /></a>
                    : <Link className="h-btn h-btn-p" href="/subscription/">Live subscription <Arrow /></Link>}
                <p className="h-dact-n">{m.ctaNote}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <DetailTabs tabs={tabs} />

      <div className="h-wrap h-main h-dgrid">
        <div className="h-dcol">
          <Card id="overview" title="Company overview">
            {m.aboutHtml ? <ReadMore html={m.aboutHtml} /> : <p className="h-muted">The company description has not been entered for this issue.</p>}
            <dl className="h-ofacts">
              {m.industry ? <div><Icon name="building" size={20} /><span><dt>Industry</dt><dd>{m.industry}</dd></span></div> : null}
              <div><Icon name="layers" size={20} /><span><dt>Board</dt><dd>{c.board}</dd></span></div>
              {m.website ? <div><Icon name="globe" size={20} /><span><dt>Website</dt><dd><a className="h-link-in" href={m.website} target="_blank" rel="noopener noreferrer">{m.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a></dd></span></div> : null}
            </dl>
          </Card>

          {m.sub ? (
            <Card id="subscription" title="Subscription status" note={m.sub.asOf ? `${m.sub.final ? 'Final' : 'As of'} ${m.sub.asOf}` : undefined}>
              <div className="h-substat">
                <div className="h-substat-big"><strong className="num">{m.sub.total.times}</strong><span>Overall subscription</span></div>
                <div className="h-tbl-wrap">
                  <table className="h-tbl h-tbl-mini">
                    <thead><tr><th>Category</th><th className="r">Times</th><th className="r">Shares offered</th><th className="r">Shares bid</th></tr></thead>
                    <tbody>
                      {m.sub.rows.map((r) => (
                        <tr key={r.key} className={r.nested ? 'nested' : undefined}><td>{r.label}</td><td className="r num"><b>{r.times}</b></td><td className="r num">{r.book}</td><td className="r num">{r.bid}</td></tr>
                      ))}
                      <tr className="tot"><td>Total</td><td className="r num">{m.sub.total.times}</td><td className="r num">{m.sub.total.book}</td><td className="r num">{m.sub.total.bid}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              {m.sub.total.applications ? <p className="h-note">{m.sub.total.applications} applications received.</p> : null}
              {m.sub.anchorNote ? <p className="h-note">{m.sub.anchorNote}</p> : null}
            </Card>
          ) : null}

          {m.financialsHtml ? (
            <Card id="financials" title="Financial performance" note="As stated in the offer document">
              <div className="h-prose h-fin h-tbl-wrap" dangerouslySetInnerHTML={{ __html: m.financialsHtml }} />
            </Card>
          ) : null}

          {m.strengthsHtml ? (
            <Card id="strengths" title="Strengths" note="As stated by the company">
              <div className="h-prose" dangerouslySetInnerHTML={{ __html: m.strengthsHtml }} />
            </Card>
          ) : null}
        </div>

        <div className="h-dcol">
          <Card id="highlights" title="IPO highlights">
            <dl className="h-hl-list">
              {highlights.filter((h) => h[2]).map(([ic, k, v]) => <div key={k}><dt><Icon name={ic} size={18} />{k}</dt><dd className="num">{v}</dd></div>)}
            </dl>
          </Card>

          {m.reservation.length ? (
            <Card id="reservation" title="Reservation" note="Share of the offer">
              <div className="h-stack" aria-hidden="true">{m.reservation.map((r, i) => <span key={r.key} style={{ flex: `${Math.max(r.pct, 1.5)} 1 0`, background: shade(i) }} />)}</div>
              <ul className="h-legend">
                {m.reservation.map((r, i) => <li key={r.key}><i style={{ background: shade(i) }} aria-hidden="true" /><span>{r.label}</span><small className="num">{r.shares} sh</small><b className="num">{r.pct}%</b></li>)}
              </ul>
            </Card>
          ) : null}

          {m.lots.length ? (
            <Card id="lots" title="How much to apply" note={`At ${m.upperPrice}`}>
              <ul className="h-lots">
                {m.lots.map((l) => (
                  <li key={l.cat}>
                    <span><b>{l.cat}</b>{l.sub ? <small>{l.sub}</small> : null}</span>
                    <span className="num"><b>{l.amount}</b><small>{l.lots} lot{l.lots === '1' ? '' : 's'} · {l.shares} shares</small></span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {m.qibSplit.length ? (
            <Card id="qib" title="Inside QIB" note="Share of QIB bids">
              <ul className="h-legend">{m.qibSplit.map((q, i) => <li key={q.label}><i style={{ background: shade(i) }} aria-hidden="true" /><span>{q.label}</span><small className="num">{q.shares} sh</small><b className="num">{q.pct}%</b></li>)}</ul>
            </Card>
          ) : null}
        </div>

        <div className="h-dcol">
          {m.timeline.length ? (
            <Card id="timeline" title="IPO timeline">
              <ol className="h-tl">
                {m.timeline.map((t) => <li key={t.label} className={t.done ? 'done' : undefined}><i aria-hidden="true" /><b>{t.label}</b><span className="num">{t.date}</span></li>)}
              </ol>
            </Card>
          ) : null}

          {m.objects.length ? (
            <Card id="objects" title="Objects of the issue" icon="target">
              <ul className="h-bul">{m.objects.map((o) => <li key={o}>{o}</li>)}</ul>
            </Card>
          ) : null}

          {m.documents.length ? (
            <Card id="documents" title="Documents" icon="doc">
              <div className="h-docs">
                {m.documents.map((d) => <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer"><b>{d.label}</b><Icon name="download" size={18} /></a>)}
              </div>
            </Card>
          ) : null}

          {m.registrarInfo ? (
            <Card id="registrar" title="Registrar to the issue" icon="bank">
              <p className="h-reg-n">{m.registrarInfo.name}</p>
              <ul className="h-reg-c">
                {m.registrarInfo.phone ? <li><Icon name="phone" size={16} /><a href={`tel:${m.registrarInfo.phone.replace(/[^\d+]/g, '')}`}>{m.registrarInfo.phone}</a></li> : null}
                {m.registrarInfo.email ? <li><Icon name="mail" size={16} /><a href={`mailto:${m.registrarInfo.email}`}>{m.registrarInfo.email}</a></li> : null}
                {m.registrarInfo.url ? <li><Icon name="globe" size={16} /><a href={m.registrarInfo.url} target="_blank" rel="noopener noreferrer">Check allotment on the registrar’s site <ExtIcon /></a></li> : null}
              </ul>
            </Card>
          ) : null}

          {m.leads.length ? (
            <Card id="leads" title="Lead managers">
              <ul className="h-bul">{m.leads.map((l) => <li key={l}>{l}</li>)}</ul>
            </Card>
          ) : null}
        </div>
      </div>

      {m.others.length ? (
        <section className="h-wrap h-others" aria-labelledby="ot-h">
          <h2 id="ot-h" className="h-h2">Other IPOs</h2>
          <div className="h-others-g">
            {m.others.map((o) => (
              <Link key={o.sym} href={o.href} className="h-card h-other">
                <span className="h-co"><Logo ipo={o} size="sm" /><span><b>{o.name}</b><small>{o.board} · {o.dates}</small></span></span>
                <Status tone={o.tone}>{o.status}</Status>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
