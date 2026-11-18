import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DetailModel } from '@/core/models';
import Countdown from './Countdown';
import { FinChart, ReadMore, Share, Tabs } from './DetailBits';
import { Arrow, Board, DayBars, Icon, Logo, Status, Ttl, shade, targetOf, type IconName } from './parts';

/*
 * Bento's IPO page, after the reference: an identity header with share and
 * one action, a stat strip, pinned section tabs, then a main column of cards
 * (company, key dates, issue details, day-wise subscription, financials,
 * reservation) beside a side column (countdown, at a glance, registrar,
 * documents, strengths). Server-rendered; only the small pieces in
 * DetailBits and the countdown run in the browser.
 */

function Card({ id, title, icon, note, children, className = '' }: { id: string; title: string; icon?: IconName; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`b-card b-dcard ${className}`} id={id} aria-labelledby={`${id}-h`}>
      <div className="b-card-h"><Ttl id={`${id}-h`}>{icon ? <Icon name={icon} size={19} /> : null}{title}</Ttl>{note ? <span className="b-note">{note}</span> : null}</div>
      {children}
    </section>
  );
}

const TL_ICON: Record<string, IconName> = { 'Bidding opens': 'calendar', 'Bidding closes': 'calendar', Allotment: 'award', Refunds: 'card', 'Demat credit': 'layers', Listing: 'flag' };

export default function DetailPage({ model: m }: { model: DetailModel }) {
  const c = m.card;
  const target = targetOf(c);
  const rhp = m.documents[0];
  const val = (k: string) => m.facts.find((f) => f.k === k)?.v;
  const strip: [IconName, string, string][] = [
    ['tag', 'Price band', c.band],
    ['layers', 'Issue size', c.size],
    ['grid', 'Lot size', m.lot],
    ['chart', 'Issue type', m.mechanism],
    ['bank', 'Listing on', c.exchanges],
  ];
  const details: [string, string | undefined][] = [
    ['Price band', c.band !== '—' ? c.band : undefined], ['Face value', val('Face value')], ['Issue size', c.size !== '—' ? c.size : undefined],
    ['Fresh issue', val('Fresh issue')], ['Offer for sale (OFS)', val('Offer for sale')], ['Issue type', m.mechanism], ['Listing on', c.exchanges], ['ISIN', val('ISIN')],
  ];
  const tabs: [string, string][] = [['overview', 'Overview']];
  if (m.sub) tabs.push(['subscription', 'Subscription']);
  if (m.financials || m.financialsHtml) tabs.push(['financials', 'Financials']);
  if (m.reservation.length) tabs.push(['reservation', 'Reservation']);
  if (m.documents.length) tabs.push(['documents', 'Documents']);
  if (m.registrarInfo) tabs.push(['registrar', 'Registrar']);

  return (
    <>
      <div className="b-dtop">
        <div className="b-wrap">
          <nav className="b-crumb" aria-label="Breadcrumb"><Link href="/" aria-label="Home"><Icon name="home" size={15} /></Link><Icon name="chevron" size={13} /><Link href="/">IPOs</Link><Icon name="chevron" size={13} /><span>{c.name} IPO</span></nav>
          <div className="b-dhead">
            <div className="b-dlogo"><Logo ipo={c} size="lg" /></div>
            <div className="b-did">
              <div className="b-did-t"><h1 className="b-h1 b-h1-d">{c.name} IPO</h1><Status tone={c.tone}>{c.status}</Status></div>
              {c.legal !== c.name ? <p className="b-did-l">{c.legal}</p> : null}
              <div className="b-chips b-did-c">
                {c.exchanges.split(',').map((e) => <span key={e} className="b-chip"><Icon name="bank" size={13} />{e.trim()}</span>)}
                {m.industry ? <span className="b-chip"><Icon name="layers" size={13} />{m.industry}</span> : null}
                <Board board={c.board} />
              </div>
              {c.blurb ? <p className="b-did-b">{c.blurb}</p> : null}
            </div>
            <div className="b-dact">
              <Share title={`${c.name} IPO`} />
              {c.tone === 'closed'
                ? <Link className="b-btn b-btn-p" href="/allotment/">Check allotment <Arrow /></Link>
                : rhp ? <a className="b-btn b-btn-p" href={rhp.url} target="_blank" rel="noopener noreferrer">Read the {rhp.label} <Icon name="ext" size={16} /></a>
                  : <Link className="b-btn b-btn-p" href="/subscription/">Live subscription <Arrow /></Link>}
            </div>
          </div>
          <dl className="b-dstrip">
            {strip.map(([ic, k, v]) => <div key={k}><span className="b-strip-ic sm"><Icon name={ic} size={19} /></span><span><dt>{k}</dt><dd className="num">{v}</dd></span></div>)}
          </dl>
        </div>
      </div>
      <Tabs tabs={tabs} />

      <div className="b-wrap b-main b-dgrid">
        <div className="b-dmain">
          <Card id="overview" title="About the company">
            {m.aboutHtml ? <ReadMore html={m.aboutHtml} /> : <p className="b-muted">The company description has not been entered for this issue.</p>}
          </Card>

          <div className="b-row b-row-eq">
            {m.timeline.length ? (
              <Card id="dates" title="IPO highlights">
                <ul className="b-iconlist">{m.timeline.map((t) => <li key={t.label} className={t.done ? 'done' : undefined}><span className="b-il-ic"><Icon name={TL_ICON[t.label] || 'calendar'} size={17} /></span><span>{t.label}</span><b className="num">{t.date}</b></li>)}</ul>
              </Card>
            ) : null}
            <Card id="details" title="Issue details">
              <dl className="b-kv">{details.filter((d) => d[1]).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>
            </Card>
          </div>

          {m.sub ? (
            <Card id="subscription" title="Subscription (day-wise)" note={m.sub.asOf ? `${m.sub.final ? 'Final' : 'Updated'}: ${m.sub.asOf}` : undefined}>
              <div className="b-dsub">
                <div className="b-dsub-l">
                  <div className="b-overall b-overall-solid"><span>Overall subscription</span><strong className="num">{m.sub.total.times}</strong></div>
                  <dl className="b-kv b-kv-tight">{m.sub.rows.filter((r) => !r.nested).map((r) => <div key={r.key}><dt>{r.label}</dt><dd className="num">{r.times}</dd></div>)}</dl>
                </div>
                <div className="b-dsub-r">
                  {m.days.length ? <DayBars days={m.days} /> : (
                    <div className="b-tbl-wrap">
                      <table className="b-mini">
                        <thead><tr><th>Category</th><th className="r">Shares offered</th><th className="r">Shares bid</th><th className="r">Times</th></tr></thead>
                        <tbody>{m.sub.rows.map((r) => <tr key={r.key} className={r.nested ? 'nested' : undefined}><td>{r.label}</td><td className="r num">{r.book}</td><td className="r num">{r.bid}</td><td className="r num"><b>{r.times}</b></td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              {m.sub.total.applications ? <p className="b-note">{m.sub.total.applications} applications received.</p> : null}
              {m.sub.anchorNote ? <p className="b-note">{m.sub.anchorNote}</p> : null}
            </Card>
          ) : null}

          {m.financials ? (
            <Card id="financials" title="Financial highlights" note="₹ Cr, as stated in the offer document"><FinChart fin={m.financials} /></Card>
          ) : m.financialsHtml ? (
            <Card id="financials" title="Financial highlights" note="As stated in the offer document"><div className="b-prose b-tbl-wrap" dangerouslySetInnerHTML={{ __html: m.financialsHtml }} /></Card>
          ) : null}

          {m.reservation.length || m.lots.length ? (
            <div className="b-row b-row-eq">
              {m.reservation.length ? (
                <Card id="reservation" title="Reservation" note="Share of the offer">
                  <div className="b-stack" aria-hidden="true">{m.reservation.map((r, i) => <span key={r.key} style={{ flex: `${Math.max(r.pct, 1.5)} 1 0`, background: shade(i) }} />)}</div>
                  <ul className="b-legend">{m.reservation.map((r, i) => <li key={r.key}><i style={{ background: shade(i) }} aria-hidden="true" /><span>{r.label}</span><small className="num">{r.shares} sh</small><b className="num">{r.pct}%</b></li>)}</ul>
                </Card>
              ) : null}
              {m.lots.length ? (
                <Card id="lots" title="How much to apply" note={`At ${m.upperPrice}`}>
                  <ul className="b-lots">{m.lots.map((l) => <li key={l.cat}><span><b>{l.cat}</b>{l.sub ? <small>{l.sub}</small> : null}</span><span className="num"><b>{l.amount}</b><small>{l.lots} lot{l.lots === '1' ? '' : 's'} · {l.shares} shares</small></span></li>)}</ul>
                </Card>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="b-dside">
          {target ? <div className="b-card b-dcd"><Countdown at={target.at} label={target.label} secs /></div>
            : m.sub ? <div className="b-card b-dcd"><p className="b-cd-l"><Icon name="chart" size={18} />{m.sub.final ? 'Subscribed, final' : 'Subscribed so far'}</p><strong className="b-dcd-x num">{m.sub.total.times}</strong></div> : null}

          <Card id="glance" title="IPO at a glance">
            <div className="b-glance-p"><div><b className="num">{m.upperPrice}</b><span>Upper price</span></div><div><b className="num">{m.lowerPrice}</b><span>Lower price</span></div></div>
            <ul className="b-iconlist b-iconlist-v">
              <li><span className="b-il-ic"><Icon name="coins" size={17} /></span><span><b className="num">{c.size}</b><small>Total issue size</small></span></li>
              <li><span className="b-il-ic"><Icon name="layers" size={17} /></span><span><b className="num">{m.lot}</b><small>Lot size</small></span></li>
              {val('Fresh issue') ? <li><span className="b-il-ic"><Icon name="chart" size={17} /></span><span><b className="num">{val('Fresh issue')}</b><small>Fresh issue</small></span></li> : null}
              {val('Offer for sale') ? <li><span className="b-il-ic"><Icon name="users" size={17} /></span><span><b className="num">{val('Offer for sale')}</b><small>Offer for sale</small></span></li> : null}
            </ul>
          </Card>

          {m.registrarInfo ? (
            <Card id="registrar" title="Registrar">
              <p className="b-reg-n">{m.registrarInfo.name}</p>
              <ul className="b-reg-c">
                {m.registrarInfo.phone ? <li><Icon name="phone" size={16} /><a href={`tel:${m.registrarInfo.phone.replace(/[^\d+]/g, '')}`}>{m.registrarInfo.phone}</a></li> : null}
                {m.registrarInfo.email ? <li><Icon name="mail" size={16} /><a href={`mailto:${m.registrarInfo.email}`}>{m.registrarInfo.email}</a></li> : null}
                {m.registrarInfo.url ? <li><Icon name="globe" size={16} /><a href={m.registrarInfo.url} target="_blank" rel="noopener noreferrer">Check allotment on the registrar’s site</a><Icon name="ext" size={14} /></li> : null}
              </ul>
            </Card>
          ) : null}

          {m.documents.length ? (
            <Card id="documents" title="Important documents">
              <ul className="b-docs">{m.documents.map((d) => <li key={d.url}><a href={d.url} target="_blank" rel="noopener noreferrer"><Icon name="doc" size={17} /><span>{d.label}</span><Icon name="download" size={17} /></a></li>)}</ul>
            </Card>
          ) : null}

          {m.strengthsHtml ? (
            <Card id="strengths" title="Key strengths" note="As stated by the company">
              <div className="b-prose b-checks" dangerouslySetInnerHTML={{ __html: m.strengthsHtml }} />
            </Card>
          ) : null}

          {m.objects.length ? (
            <Card id="objects" title="Objects of the issue">
              <ul className="b-checks-l">{m.objects.map((o) => <li key={o}>{o}</li>)}</ul>
            </Card>
          ) : null}

          {m.leads.length ? (
            <Card id="leads" title="Lead managers">
              <ul className="b-checks-l">{m.leads.map((l) => <li key={l}>{l}</li>)}</ul>
            </Card>
          ) : null}
        </aside>
      </div>

      {m.others.length ? (
        <section className="b-wrap b-others" aria-labelledby="ot-h">
          <h2 id="ot-h" className="b-h2">Other IPOs</h2>
          <div className="b-others-g">
            {m.others.map((o) => (
              <Link key={o.sym} href={o.href} className="b-card b-other">
                <span className="b-calco"><Logo ipo={o} size="sm" /><span><b>{o.name}</b><small>{o.board} · {o.dates}</small></span></span>
                <Status tone={o.tone}>{o.status}</Status>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
