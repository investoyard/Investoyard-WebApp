import Link from 'next/link';
import type { DetailModel } from '@/core/models';
import { dayMon, dayMonYear } from '@/core/format';
import { Bar, BoardTag, Icon, Logo, State, ring, shade } from './parts';
import ShareButton from './ShareButton';

/*
 * Prism's IPO page, after the operator's layout: a header with the logo, tags
 * and actions; an icon strip of the eight figures and dates; section tabs;
 * then cards — overview, timeline, key details, financials, subscription,
 * how much to apply, strengths, reservation, objects, documents, registrar,
 * the allotment card, and other current IPOs.
 *
 * Deliberately absent from the layout: valuation ratios and any listing-gain
 * estimate (not held, and an estimate is a recommendation), company facts
 * and risks (not stored), and a watchlist (no sign-in on a partner site yet).
 */

export default function DetailPage({ model: m }: { model: DetailModel }) {
  const c = m.card;
  const closed = c.tone === 'closed';
  const sub = m.sub;
  const strip: { icon: Parameters<typeof Icon>[0]['name']; k: string; v: string }[] = [
    { icon: 'tag', k: 'Price band', v: c.band },
    { icon: 'box', k: 'Lot size', v: m.lot },
    { icon: 'coins', k: 'Min. investment', v: c.min },
    { icon: 'layers', k: 'Issue size', v: c.size },
    { icon: 'calendar', k: 'IPO open', v: c.open ? dayMon(c.open) : '—' },
    { icon: 'calendar', k: 'IPO close', v: c.close ? dayMon(c.close) : '—' },
    { icon: 'calendar', k: 'Allotment', v: c.allotment ? dayMon(c.allotment) : '—' },
    { icon: 'calendar', k: 'Listing', v: c.listing ? dayMon(c.listing) : '—' },
  ];
  const tabs: [string, string, Parameters<typeof Icon>[0]['name'], boolean][] = [
    ['overview', 'Overview', 'layers', true],
    ['subscription', 'Subscription', 'chart', !!sub],
    ['financials', 'Financials', 'pct', !!m.financialsHtml],
    ['documents', 'Documents', 'doc', m.documents.length > 0],
    ['registrar', 'Registrar', 'building', !!m.registrarInfo],
  ];
  const timeline = m.timeline.filter((t) => /opens|closes|allotment|listing/i.test(t.label));
  const subMain = sub ? sub.rows.filter((r) => !r.nested) : [];
  const totalBook = subMain.reduce((a, r) => a + (Number(r.book.replace(/,/g, '')) || 0), 0);

  return (
    <div className="p-wrap p-main">
      <nav className="p-crumb" aria-label="Breadcrumb">
        <Link href="/"><Icon name="home" size={16} /></Link><span aria-hidden="true">›</span>
        <Link href="/">IPOs</Link><span aria-hidden="true">›</span><span>{c.name} IPO</span>
      </nav>

      <header className="p-dhead">
        {c.logo ? <img className="p-dlogo" src={c.logo} alt="" /> : <span className="p-dini" aria-hidden="true">{c.ini}</span>}
        <div style={{ minWidth: 0 }}>
          <h1>{c.name} IPO <BoardTag board={c.board} /><State tone={c.tone}>{c.status}</State></h1>
          {c.legal !== c.name ? <p className="p-legal">{c.legal}</p> : null}
          <div className="p-dmeta">
            {m.industry ? <span><Icon name="building" size={16} />{m.industry}</span> : null}
            <span>{c.exchanges}</span>
            <span>{m.mechanism}</span>
          </div>
        </div>
        <div className="p-dact">
          <ShareButton title={`${c.name} IPO`} />
          {closed ? <Link className="p-btn" href="/allotment/"><Icon name="check" size={18} />Check allotment</Link>
            : m.documents[0] ? <a className="p-btn" href={m.documents[0].url} target="_blank" rel="noopener noreferrer"><Icon name="doc" size={18} />Read the {m.documents[0].label}</a> : null}
        </div>
      </header>

      <dl className="p-strip">
        {strip.map((s) => <div key={s.k}><Icon name={s.icon} size={22} /><dt>{s.k}</dt><dd title={s.v}>{s.v}</dd></div>)}
      </dl>

      <nav className="p-dtabs" aria-label="Sections">
        {tabs.filter((t) => t[3]).map(([id, label, icon], i) => <a key={id} href={`#${id}`} className={i === 0 ? 'on' : undefined}><Icon name={icon} size={18} />{label}</a>)}
      </nav>

      <div className="p-dgrid">
        <div className="p-row2" id="overview">
          <section className="p-card p-card-pad" aria-labelledby="co-h">
            <div className="p-card-h"><h2 id="co-h"><Icon name="building" size={22} />Company overview</h2>{m.website ? <a className="p-link" href={m.website} target="_blank" rel="noopener noreferrer"><Icon name="globe" size={16} />Website</a> : null}</div>
            {m.aboutHtml ? <div className="p-prose p-clamp" dangerouslySetInnerHTML={{ __html: m.aboutHtml }} /> : <p className="p-muted">The company description has not been published here yet. The offer documents carry the full business overview.</p>}
          </section>
          <div style={{ display: 'grid', gap: 22, minWidth: 0 }}>
            {timeline.length ? (
              <section className="p-card p-card-pad" aria-labelledby="tl-h">
                <div className="p-card-h"><h2 id="tl-h"><Icon name="calendar" size={22} />IPO timeline</h2></div>
                <ol className="p-timeline">
                  {timeline.map((t) => <li key={t.label} className={t.done ? 'done' : undefined}><b>{t.label.replace('Bidding opens', 'Open').replace('Bidding closes', 'Close')}</b>{t.date}</li>)}
                </ol>
              </section>
            ) : null}
            <section className="p-card p-card-pad" aria-labelledby="kd-h">
              <div className="p-card-h"><h2 id="kd-h"><Icon name="layers" size={22} />Key IPO details</h2></div>
              <dl className="p-kvt">
                {m.facts.map((f) => <div key={f.k}><dt>{f.k}</dt><dd>{f.v}</dd></div>)}
                <div><dt>Issue size</dt><dd>{c.size}</dd></div>
                <div><dt>Price band</dt><dd>{c.band}</dd></div>
              </dl>
            </section>
          </div>
        </div>

        <div className="p-row2">
          <section className="p-card p-card-pad" id="financials" aria-labelledby="fi-h">
            <div className="p-card-h"><h2 id="fi-h"><Icon name="chart" size={22} />Financial highlights</h2></div>
            {m.financialsHtml ? <div className="p-prose p-scroll" dangerouslySetInnerHTML={{ __html: m.financialsHtml }} /> : <p className="p-muted">Financials have not been published here yet; see the offer documents.</p>}
          </section>
          <section className="p-card p-card-pad" id="subscription" aria-labelledby="su-h">
            <div className="p-card-h">
              <h2 id="su-h"><Icon name="chart" size={22} />Subscription status</h2>
              {sub ? <span className="p-badge brand">Total: {sub.total.times}</span> : null}
            </div>
            {sub ? (
              <div className="p-donut-wrap sm">
                <div className="p-donut" style={{ background: ring(subMain.map((r) => (totalBook ? Math.round(((Number(r.book.replace(/,/g, '')) || 0) / totalBook) * 1000) / 10 : 0))) }}>
                  <div className="p-donut-c"><strong>{sub.total.times}</strong><span>{sub.final ? 'final' : 'so far'}</span></div>
                </div>
                <div className="p-table-wrap">
                  <table className="p-table" style={{ fontSize: 14 }}>
                    <thead><tr><th>Category</th><th className="r hide-s">Shares offered</th><th className="r">Times</th></tr></thead>
                    <tbody>
                      {sub.rows.map((r, i) => (
                        <tr key={r.key} className={r.nested ? 'nested' : undefined}>
                          <td>{!r.nested ? <i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, marginRight: 8, background: shade(subMain.findIndex((x) => x.key === r.key)) }} aria-hidden="true" /> : null}{r.label}</td>
                          <td className="r hide-s">{r.book}</td>
                          <td className="r"><span className="p-badge">{r.times}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : <p className="p-muted">Subscription figures appear once bidding opens.</p>}
            {sub ? <p className="p-muted" style={{ marginTop: 12, fontSize: 13 }}>{sub.asOf ? `${sub.final ? 'Final' : 'Updated'} ${sub.asOf}. ` : ''}Ring shows each category’s share of shares offered. {sub.anchorNote || ''}</p> : null}
          </section>
        </div>

        <div className="p-row3">
          {m.lots.length ? (
            <section className="p-card p-card-pad" aria-labelledby="lo-h">
              <div className="p-card-h"><h2 id="lo-h"><Icon name="coins" size={22} />How much to apply</h2></div>
              <ul className="p-catrows">
                {m.lots.map((l) => <li key={l.cat} style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}><span><b style={{ textAlign: 'left' }}>{l.cat}</b><span className="p-muted" style={{ display: 'block', fontSize: 13 }}>{l.lots} lot{l.lots === '1' ? '' : 's'} · {l.shares} shares</span></span><b>{l.amount}</b></li>)}
              </ul>
              <p className="p-muted" style={{ marginTop: 8, fontSize: 13 }}>At the upper price of {m.upperPrice}.</p>
            </section>
          ) : null}
          <section className="p-card p-card-pad" aria-labelledby="st-h">
            <div className="p-card-h"><h2 id="st-h"><Icon name="trend" size={22} />Strengths</h2></div>
            {m.strengthsHtml ? <div className="p-prose" dangerouslySetInnerHTML={{ __html: m.strengthsHtml }} /> : <p className="p-muted">As stated in the offer documents.</p>}
          </section>
          {m.reservation.length ? (
            <section className="p-card p-card-pad" aria-labelledby="re-h">
              <div className="p-card-h"><h2 id="re-h"><Icon name="users" size={22} />Who the offer is for</h2></div>
              <ul className="p-catrows">
                {m.reservation.map((r) => <li key={r.key} style={{ gridTemplateColumns: '96px minmax(0, 1fr) 62px' }}><span>{r.label}</span><Bar width={r.pct} /><b>{r.pct}%</b></li>)}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="p-row3">
          {m.objects.length ? (
            <section className="p-card p-card-pad" aria-labelledby="ob-h">
              <div className="p-card-h"><h2 id="ob-h"><Icon name="check" size={22} />Objects of the issue</h2></div>
              <ul className="p-checks">{m.objects.slice(0, 6).map((o) => <li key={o}><Icon name="tick" size={16} stroke={2.4} />{o}</li>)}</ul>
            </section>
          ) : null}
          <section className="p-card p-card-pad" id="documents" aria-labelledby="dc-h">
            <div className="p-card-h"><h2 id="dc-h"><Icon name="doc" size={22} />Documents</h2></div>
            {m.documents.length ? (
              <ul className="p-doclist">{m.documents.map((d) => <li key={d.url}><a href={d.url} target="_blank" rel="noopener noreferrer"><Icon name="doc" size={20} /><span>{d.label}</span><Icon name="ext" size={16} /></a></li>)}</ul>
            ) : <p className="p-muted">No offer documents published here yet.</p>}
          </section>
          {m.registrarInfo ? (
            <section className="p-card p-card-pad" id="registrar" aria-labelledby="rg-h">
              <div className="p-card-h"><h2 id="rg-h"><Icon name="building" size={22} />Registrar</h2></div>
              <p className="p-reg-name">{m.registrarInfo.name}</p>
              <ul className="p-reg" style={{ marginTop: 8 }}>
                {m.registrarInfo.url ? <li><Icon name="globe" size={16} /><a className="p-link" href={m.registrarInfo.url} target="_blank" rel="noopener noreferrer">Registrar website</a></li> : null}
                {m.registrarInfo.phone ? <li><Icon name="phone" size={16} /><a href={`tel:${m.registrarInfo.phone.replace(/[^0-9+]/g, '')}`}>{m.registrarInfo.phone}</a></li> : null}
                {m.registrarInfo.email ? <li><Icon name="mail" size={16} /><a href={`mailto:${m.registrarInfo.email}`}>{m.registrarInfo.email}</a></li> : null}
              </ul>
            </section>
          ) : null}
          <section className="p-card p-card-pad p-cta-card" aria-labelledby="ca-h">
            <h2 id="ca-h" className="dsp" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 21, fontWeight: 700 }}><Icon name="check" size={22} />Check IPO allotment</h2>
            <p>{closed ? `Find out whether you were allotted shares in ${c.name}.` : `Allotment for ${c.name} is ${c.allotment ? `due ${dayMonYear(c.allotment)}` : 'after bidding closes'}. Check here once the registrar publishes.`}</p>
            <Link className="p-btn" href="/allotment/">Check allotment now <Icon name="arrow" size={16} /></Link>
          </section>
        </div>

        {m.others.length ? (
          <section aria-labelledby="ot-h">
            <div className="p-sec-h" style={{ marginBottom: 14 }}>
              <div className="p-sec-title"><Icon name="layers" size={24} /><h2 id="ot-h" style={{ fontSize: 24 }}>Other IPOs</h2></div>
              <Link className="p-btn p-btn-q p-btn-sm" href="/">View all IPOs <Icon name="arrow" size={15} /></Link>
            </div>
            <div className="p-others">
              {m.others.map((o) => (
                <Link key={o.sym} className="p-card p-other" href={o.href}>
                  <Logo ipo={o} />
                  <div style={{ minWidth: 0 }}>
                    <div className="p-other-name">{o.name}</div>
                    <div style={{ marginTop: 6 }}><BoardTag board={o.board} /></div>
                    <div className="p-other-band num">{o.band}</div>
                    <small><Icon name="calendar" size={14} />{o.status}</small>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
