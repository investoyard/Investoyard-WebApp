import type { Metadata } from 'next';
import { getIpoDetail } from '@/lib/api';
import { inr, priceBand, closesInLabel } from '@/lib/format';
import { ApplyPanel, ApplyBar } from '@/components/IpoActions';
import { IpoLogo } from '@/components/IpoLogo';
import { CountdownDial } from '@/components/CountdownDial';
import { SectionTabs } from '@/components/SectionTabs';
import { LiveSubscription } from '@/components/LiveSubscription';
import { GmpTrend } from '@/components/GmpTrend';
import { Icon } from '@/components/Icon';
import * as calc from '@/lib/ipoCalc';
import { cleanRich } from '@/lib/richClean';
import { catColor, shC, fmtDate, relText, timelineStates, segLabel, segTextColor } from '@/lib/catColor';
import { makeT, Lang } from '@investoyard/i18n';

/** hreflang alternates shared by the en page and the /[lang]/ SEO routes. */
export function detailAlternates(symbol: string, lang: Lang): Metadata['alternates'] {
  return {
    canonical: lang === 'en' ? `/ipos/${symbol}/` : `/${lang}/ipos/${symbol}/`,
    languages: { en: `/ipos/${symbol}/`, hi: `/hi/ipos/${symbol}/`, 'x-default': `/ipos/${symbol}/` },
  };
}

/** Locale-parameterized detail view — rendered at /ipos/[symbol] (en) and /[lang]/ipos/[symbol]. */
export async function IpoDetailView({ lang, symbol }: { lang: Lang; symbol: string }) {
  const ipo = await getIpoDetail(symbol);
  if (!ipo) {
    const tr0 = makeT(lang);
    const home0 = lang === 'en' ? '/' : `/${lang}/`;
    return <p className="muted">{tr0('detail.notFound')} <a className="linklike" href={home0}>← All IPOs</a></p>;
  }
  return <IpoDetailBody lang={lang} ipo={ipo} />;
}

/**
 * Pure presentational body — shared by the build-time page above and the client-side
 * fallback route (/ipos/live) that serves IPOs added AFTER the last static build.
 */
export function IpoDetailBody({ lang, ipo }: { lang: Lang; ipo: NonNullable<Awaited<ReturnType<typeof getIpoDetail>>> }) {
  const tr = makeT(lang);
  const q = lang === 'en' ? '' : `?lang=${lang}`; // app-page links keep the query form
  const home = lang === 'en' ? '/' : `/${lang}/`;

  const closes = ipo.status === 'open' ? closesInLabel(ipo.closeDate) : null;

  // operator-entered rich content (from the admin form's `extra`); prefer it when present.
  const ex: Record<string, any> = ipo.extra ?? {};
  const rich = (s?: string) => (typeof s === 'string' && s.replace(/<[^>]*>/g, '').trim().length > 0 ? s : null);
  const isHtml = (s?: string) => typeof s === 'string' && /<[a-z][\s\S]*>/i.test(s);
  const opFaqs: { q: string; a: string }[] = Array.isArray(ex.faqs) ? ex.faqs.filter((f: any) => f?.q?.trim()) : [];
  const faqList = opFaqs.length ? opFaqs : (ipo.faqs ?? []);

  const tlStates = timelineStates(calc.timeline(ipo));
  const todayMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();
  const resRows = calc.reservation(ipo);
  const subT = calc.subscriptionTable(ipo);
  const subAsOfRaw = ipo.subscription?.find((s) => s.asOf)?.asOf;
  const subAsOf = subAsOfRaw ? fmtDate(subAsOfRaw.slice(0, 10)) : undefined;

  // group the lot ladder by category (min → max lots)
  const lotGroups: { cat: string; sub: string; min: calc.LotRow; max: calc.LotRow }[] = [];
  for (const rr of calc.lotLadder(ipo)) {
    const gg = lotGroups.find((x) => x.cat === rr.cat);
    if (!gg) lotGroups.push({ cat: rr.cat, sub: rr.sub, min: rr, max: rr });
    else { if (rr.lots < gg.min.lots) gg.min = rr; if (rr.lots > gg.max.lots) gg.max = rr; }
  }
  const finMax = ipo.financialRows ? Math.max(1, ...ipo.financialRows[0].values) : 1;

  // "How to apply" & "FAQs" intentionally omitted from the tab nav — their sections still render on scroll.
  const tabs = [
    { id: 'overview', label: 'Overview' },
    ...(ipo.subscription ? [{ id: 'subscription', label: 'Subscription' }] : []),
    { id: 'gmp', label: 'GMP' },
    ...(ipo.financialRows ? [{ id: 'financials', label: 'Financials' }] : []),
    ...(ipo.about ? [{ id: 'about', label: 'About' }] : []),
  ];

  return (
    <article className="fade-up">
      <a href={home} className="back-link">← All IPOs</a>

      <div className={`detail-hero st-${ipo.status}`}>
        <IpoLogo logo={ipo.logo} name={ipo.name} size={60} />
        <div className="grow">
          <h1 style={{ margin: 0 }}>{ipo.name}</h1>
          <div className="ic-meta" style={{ marginTop: 8 }}>
            <span className={`ic-tag ${ipo.type === 'sme' ? 'sme' : 'mb'}`}>{ipo.type === 'sme' ? 'SME' : 'Mainboard'}</span>
            <span className={`ic-dot ${ipo.status}`}>{tr(`status.${ipo.status}`)}</span>
            {ipo.exchanges && <span className="hero-ex">{ipo.exchanges.join(' · ')}</span>}
          </div>
          <div className="ic-dates" style={{ marginTop: 9 }}><Icon name="calendar" size={13} />{fmtDate(ipo.openDate)} – {fmtDate(ipo.closeDate)}</div>
        </div>
        <CountdownDial ipo={ipo} />
      </div>

      <div className="detail-layout" style={{ marginTop: 24 }}>
        <div>
          <SectionTabs items={tabs} title={ipo.name} logo={ipo.logo} status={ipo.status} statusLabel={tr(`status.${ipo.status}`)} autoFocusId={ipo.status === 'open' && ipo.subscription ? 'subscription' : undefined} />

          <section id="overview">
            <div className="metrics">
              <div className="metric hl"><div className="k">Price band</div><div className="v mono">{priceBand(ipo.priceBandMin, ipo.priceBandMax)}</div></div>
              <div className="metric"><div className="k">Bid lot</div><div className="v mono">{ipo.lotSize ?? '—'}</div></div>
              <div className="metric hl"><div className="k">Min investment</div><div className="v mono">{inr(ipo.minAmount)}</div></div>
              <div className="metric"><div className="k">Issue size</div><div className="v mono">{ipo.issueSize ?? '—'}</div></div>
            </div>

            {/* Listing performance — only once the issue is listed */}
            {ipo.status === 'listed' && (() => {
              const ex: any = (ipo as any).extra ?? {};
              const issueP = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
              const price = Number(String(ex.nseListingPrice || ex.bseListingPrice || '').replace(/[^\d.]/g, '')) ||
                (ipo.listingGainPct != null && issueP ? Math.round(issueP * (1 + ipo.listingGainPct / 100)) : 0);
              const gain = ipo.listingGainPct ?? (price && issueP ? Math.round(((price - issueP) / issueP) * 1000) / 10 : undefined);
              if (!price && gain == null) return null;
              return (
                <div className="panel" style={{ marginTop: 18 }}>
                  <h3>Listing performance</h3>
                  <div className="metrics" style={{ marginTop: 12 }}>
                    <div className="metric"><div className="k">Issue price</div><div className="v mono">₹{issueP || '—'}</div></div>
                    <div className="metric hl"><div className="k">Listing price</div><div className="v mono">{price ? `₹${price}` : '—'}</div></div>
                    {gain != null && (
                      <div className="metric"><div className="k">Listing gain</div><div className="v mono" style={{ color: gain >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{gain >= 0 ? '+' : ''}{gain}%</div></div>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="panel" style={{ marginTop: 18 }}>
              <h3>{tr('detail.keyDates')}</h3>
              <div className="hstepper" style={{ marginTop: 16 }}>
                {tlStates.map(({ item, ms, state }) => (
                  <div className={`hstep ${state}`} key={item.label}>
                    <span className="hline" />
                    <span className="hnode">
                      {state === 'done' ? <Icon name="check" size={16} strokeWidth={3} /> : state === 'now' ? <Icon name="clock" size={15} strokeWidth={2.2} /> : null}
                    </span>
                    <div className="hlbl">{item.label}</div>
                    <div className="hdt">{fmtDate(item.date)}</div>
                    <div className="hrel">{relText(ms, todayMs, state === 'done')}</div>
                  </div>
                ))}
              </div>
            </div>

            {resRows.length > 0 && (
              <div className="panel" style={{ marginTop: 18 }}>
                <div className="between"><h3>Issue reservation</h3>{ipo.issueSize && <span className="muted mono" style={{ fontSize: 13 }}>{ipo.issueSize}</span>}</div>
                <div className="alloc" style={{ marginTop: 14 }}>
                  {resRows.map((r) => (
                    <span key={r.cat} style={{ flex: Math.max(0.001, r.pct), background: catColor(r.cat), color: segTextColor(r.cat) }} title={`${r.cat} · ${r.pct}%`}>
                      {segLabel(r.cat, r.pct, false)}
                    </span>
                  ))}
                </div>
                <div className="alloc-legend" style={{ marginTop: 12 }}>
                  {resRows.map((r) => (
                    <div className="al" key={r.cat}>
                      <span className="swatch" style={{ background: catColor(r.cat) }} />
                      <div className="al-txt"><div className="who">{r.cat}</div><div className="num">{shC(r.shares)} sh · {calc.crOrInr(r.amount)}</div></div>
                      <span className="pct">{r.pct}%</span>
                    </div>
                  ))}
                </div>
                {ipo.formsFor1x && (
                  <div className="f1x-box">
                    <div className="mini-h"><Icon name="users" size={14} /> Applications required for 1× subscription</div>
                    <div className="f1x">
                      <div className="c" style={{ ['--cc' as string]: 'var(--c-retail)' } as React.CSSProperties}><div className="k">Retail (≤₹2L)</div><div className="v">{ipo.formsFor1x.retail.toLocaleString('en-IN')} <small>forms</small></div></div>
                      <div className="c" style={{ ['--cc' as string]: 'var(--c-hni1)' } as React.CSSProperties}><div className="k">S-HNI (₹2–10L)</div><div className="v">{ipo.formsFor1x.sHni.toLocaleString('en-IN')} <small>forms</small></div></div>
                      <div className="c" style={{ ['--cc' as string]: 'var(--c-hni2)' } as React.CSSProperties}><div className="k">B-HNI (&gt;₹10L)</div><div className="v">{ipo.formsFor1x.bHni.toLocaleString('en-IN')} <small>forms</small></div></div>
                    </div>
                  </div>
                )}
                {ipo.leadManagers && <div className="note-line">BRLM: {ipo.leadManagers.join(' · ')}</div>}
              </div>
            )}

            {lotGroups.length > 0 && (
              <div className="panel" style={{ marginTop: 18 }}>
                <div className="between"><h3>Lot ladder — how much to bid</h3>{ipo.lotSize && <span className="muted mono" style={{ fontSize: 13 }}>1 lot = {ipo.lotSize} shares</span>}</div>
                <div className="lots-grid" style={{ marginTop: 14 }}>
                  {lotGroups.map((g) => {
                    const single = g.min.lots === g.max.lots;
                    return (
                      <div className="lotcard" key={g.cat} style={{ ['--ccolor' as string]: catColor(g.cat) } as React.CSSProperties}>
                        <div className="lc-hdr"><span className="lc-who">{g.cat} <span className="lc-band">· {g.sub}</span></span><span className="lc-tag">{single ? `${g.min.lots}+ lots` : `${g.min.lots}–${g.max.lots} lots`}</span></div>
                        <div className="lc-grid">
                          <div className="lc-cell"><div className="k">Min · {g.min.lots} {g.min.lots > 1 ? 'lots' : 'lot'}</div><div className="v">{g.min.shares.toLocaleString('en-IN')} <small>sh · {calc.crOrInr(g.min.amount)}</small></div></div>
                          {single
                            ? <div className="lc-cell"><div className="k">Entry point</div><div className="v">{calc.crOrInr(g.min.amount)} <small>onward</small></div></div>
                            : <div className="lc-cell"><div className="k">Max · {g.max.lots} lots</div><div className="v">{g.max.shares.toLocaleString('en-IN')} <small>sh · {calc.crOrInr(g.max.amount)}</small></div></div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="cols-2" style={{ marginTop: 18 }}>
              <div className="panel">
                <h3>Issue details</h3>
                <div style={{ marginTop: 8 }}>
                  <div className="kv"><span className="k">Lead managers</span><span className="v" style={{ fontSize: 14 }}>{ipo.leadManagers?.join(', ') ?? '—'}</span></div>
                  {ipo.freshIssue && <div className="kv"><span className="k">Fresh issue</span><span className="v mono">{ipo.freshIssue}</span></div>}
                  {ipo.offerForSale && <div className="kv"><span className="k">Offer for sale</span><span className="v mono">{ipo.offerForSale}</span></div>}
                  <div className="kv"><span className="k">Face value</span><span className="v mono">₹{ipo.faceValue ?? 10}</span></div>
                  <div className="kv"><span className="k">Listing on</span><span className="v">{ipo.exchanges?.join(' · ') ?? '—'}</span></div>
                  <div className="kv"><span className="k">Registrar</span><span className="v" style={{ fontSize: 14 }}>{ipo.registrar ?? '—'}</span></div>
                </div>
              </div>
              {ipo.anchors && ipo.anchors.length > 0 && (
                <div className="panel">
                  <h3>Anchor investors</h3>
                  <div style={{ marginTop: 8 }}>
                    {ipo.anchors.map((an) => (
                      <div className="kv" key={an.name}><span className="k">{an.name}</span><span className="v mono">{an.amount}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {ipo.subscription && subT && (
            <section id="subscription">
              <div className="section-title">{tr('detail.liveSubscription')}</div>
              <LiveSubscription rows={subT.rows} total={subT.total} status={ipo.status} asOf={subAsOf} priceMin={ipo.priceBandMin} priceMax={ipo.priceBandMax ?? ipo.priceBandMin} totalApps={ipo.totalApps} />
              {/* section eyebrow kept for scroll-nav consistency */}
              {ipo.appWise && (
                <div className="panel" style={{ marginTop: 14 }}>
                  <div className="between"><h3>App-wise subscription</h3>{ipo.totalApps && <span className="muted mono" style={{ fontSize: 13 }}>~{ipo.totalApps.toLocaleString('en-IN')} apps</span>}</div>
                  <div className="subx">
                    <div className="subx-h"><span>Category</span><span>Total apps</span><span>Forms / 1×</span><span className="r">App-wise ×</span></div>
                    {ipo.appWise.map((a) => (
                      <div className="subx-row" key={a.key} style={{ ['--cc' as string]: catColor(a.label) } as React.CSSProperties}>
                        <div><span className="cat-chip">{a.label}</span></div>
                        <div className="subx-num" data-k="Total apps">{a.apps.toLocaleString('en-IN')}</div>
                        <div className="subx-num" data-k="Forms / 1×">{a.formsFor1x.toLocaleString('en-IN')}<small>for 1×</small></div>
                        <div className="r"><span className="x-badge" style={{ color: segTextColor(a.label) }}>{a.times}×</span></div>
                      </div>
                    ))}
                  </div>
                  <p className="note-line">App-wise figures estimate applicants per category from the forms required for 1× subscription.</p>
                </div>
              )}
            </section>
          )}

          <section id="gmp">
            <div className="section-title">{tr('detail.greyMarket')}</div>
            <GmpTrend ipo={ipo} />
          </section>

          {(rich(ex.companyFinancials) || (ipo.financialRows && ipo.financialYears)) && (
            <section id="financials">
              <div className="section-title">Financials</div>
              {rich(ex.companyFinancials) ? (
              <div className="panel"><div className="prose" dangerouslySetInnerHTML={{ __html: cleanRich(ex.companyFinancials) }} /></div>
              ) : (
              <div className="panel">
                <div className="between"><h3>Total income trend</h3><span className="muted mono" style={{ fontSize: 13 }}>₹ Crore</span></div>
                <div className="fin-bars">
                  {ipo.financialRows![0].values.slice().reverse().map((v, i) => (
                    <div className="fb" key={i}>
                      <div className="val">₹{Math.round(v)}</div>
                      <div className="bar" style={{ height: `${Math.max(8, (v / finMax) * 100)}%` }} />
                      <div className="yr">{ipo.financialYears!.slice().reverse()[i]}</div>
                    </div>
                  ))}
                </div>
                <div className="fin-scroll">
                  <table className="fin-tab">
                    <thead><tr><th>Metric</th>{ipo.financialYears!.map((y) => <th key={y}>{y}</th>)}</tr></thead>
                    <tbody>
                      {ipo.financialRows!.map((row) => (
                        <tr key={row.metric}>
                          <td>{row.metric}</td>
                          {row.values.map((v, i) => <td key={i} className={i === 0 ? 'up' : ''}>{v.toLocaleString('en-IN')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              )}
            </section>
          )}

          {(isHtml(ipo.objectsOfIssue) || ipo.objects) && (
            <section id="objects">
              <div className="section-title">Objects of the issue</div>
              <div className="panel">
                {isHtml(ipo.objectsOfIssue) ? (
                  <div className="prose" dangerouslySetInnerHTML={{ __html: cleanRich(ipo.objectsOfIssue) }} />
                ) : (
                  <div className="obj-list">
                    {ipo.objects!.map((o, i) => (
                      <div className="obj-row" key={i}>
                        <span className="obj-n">{i + 1}</span>
                        <span className="obj-t">{o.text}</span>
                        {o.amount && <span className="obj-amt mono">{o.amount}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {(rich(ex.companyDescription) || rich(ex.companyStrength) || rich(ex.contactInfo) || ipo.about || ipo.strengths) && (
            <section id="about">
              <div className="section-title">About the company</div>
              <div className="panel">
                {rich(ex.companyDescription)
                  ? <div className="prose" dangerouslySetInnerHTML={{ __html: cleanRich(ex.companyDescription) }} />
                  : (ipo.about && <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>{ipo.about}</p>)}

                {rich(ex.companyStrength)
                  ? <div style={{ marginTop: 18 }}><h3 style={{ fontSize: 14 }}>Company strengths</h3><div className="prose" dangerouslySetInnerHTML={{ __html: cleanRich(ex.companyStrength) }} /></div>
                  : ((ipo.strengths || ipo.strategies) && (
                    <div className="cols-2" style={{ marginTop: 16 }}>
                      {ipo.strengths && (
                        <div>
                          <h3 style={{ fontSize: 14 }}>Competitive strengths</h3>
                          <ul className="chk str">{ipo.strengths.map((s) => <li key={s}><Icon name="check" size={15} strokeWidth={3} />{s}</li>)}</ul>
                        </div>
                      )}
                      {ipo.strategies && (
                        <div>
                          <h3 style={{ fontSize: 14 }}>Business strategies</h3>
                          <ul className="chk strat">{ipo.strategies.map((s) => <li key={s}><Icon name="arrow-right" size={15} strokeWidth={2.4} />{s}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  ))}

                {(ex.companyPromoter || ipo.promoters) && (
                  <div style={{ marginTop: 18 }}>
                    <h3 style={{ fontSize: 14 }}>Promoters</h3>
                    <div className="row" style={{ marginTop: 8, gap: 8 }}>{(ex.companyPromoter ? [String(ex.companyPromoter)] : ipo.promoters!).map((p: string) => <span className="chip" key={p}>{p}</span>)}</div>
                  </div>
                )}

                {rich(ex.contactInfo) && (
                  <div style={{ marginTop: 18 }}>
                    <h3 style={{ fontSize: 14 }}>Registered office &amp; contact</h3>
                    <div className="prose" dangerouslySetInnerHTML={{ __html: cleanRich(ex.contactInfo) }} />
                  </div>
                )}
              </div>

              {ipo.type === 'sme' && ipo.smeCompliance && (
                <div className="panel" style={{ marginTop: 14 }}>
                  <div className="between"><h3>{tr('detail.smeNorms')}</h3>{ipo.smeCompliance.meetsNorms && <span className="badge-ok">{tr('detail.meetsNorms')}</span>}</div>
                  <div style={{ marginTop: 8 }}>
                    <div className="kv"><span className="k">₹1cr EBITDA test</span><span className="v">{ipo.smeCompliance.ebitdaTest ? 'Pass' : '—'}</span></div>
                    <div className="kv"><span className="k">OFS %</span><span className="v mono">{ipo.smeCompliance.ofsPct ?? '—'}%</span></div>
                    <div className="kv"><span className="k">GCP %</span><span className="v mono">{ipo.smeCompliance.gcpPct ?? '—'}%</span></div>
                  </div>
                </div>
              )}

              {(ipo.documents ?? []).filter((d) => !d.type?.startsWith('asba_form')).length > 0 && (
                <div className="panel" style={{ marginTop: 14 }}>
                  <h3>Documents</h3>
                  <div style={{ marginTop: 8 }}>
                    {/* internal ASBA print blanks (asba_form_*) are operator assets — never shown publicly */}
                    {ipo.documents!.filter((d) => !d.type?.startsWith('asba_form')).map((d) => (
                      <div className="kv" key={d.type}><span className="k">{d.type}</span><a href={d.url} className="linklike" target="_blank" rel="noreferrer">Open ↗</a></div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          <section id="how">
            <div className="section-title">How to apply</div>
            <div className="panel">
              <div className="how-steps">
                <div className="how-step"><span className="num">1</span><span className="tx"><b>Create your account & log in</b>Sign up on Investoyard and complete a quick KYC.</span></div>
                <div className="how-step"><span className="num">2</span><span className="tx"><b>Pick the IPO & tap Apply</b>Open the live IPO and choose your investor category.</span></div>
                <div className="how-step"><span className="num">3</span><span className="tx"><b>Enter bid & quantity</b>Up to 3 bids · cut-off or price band · retail cap ₹2,00,000.</span></div>
                <div className="how-step"><span className="num">4</span><span className="tx"><b>Approve the UPI mandate</b>You receive a fund-block request on your UPI app.</span></div>
                <div className="how-step"><span className="num">5</span><span className="tx"><b>Done</b>Funds stay blocked until allotment, then auto-debited (or released).</span></div>
              </div>
            </div>
          </section>

          {faqList.length > 0 && (
            <section id="faq">
              <div className="section-title">Frequently asked questions</div>
              <div className="faq-acc">
                {faqList.map((f, i) => (
                  <details key={i} open={i === 0}>
                    <summary>{f.q}</summary>
                    {isHtml(f.a) ? <div className="prose" dangerouslySetInnerHTML={{ __html: f.a }} /> : <p>{f.a}</p>}
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* sticky apply sidebar (desktop) */}
        <aside className="desktop-only detail-aside">
          <ApplyPanel
            symbol={ipo.symbol} status={ipo.status}
            priceLabel={priceBand(ipo.priceBandMin, ipo.priceBandMax)}
            minAmount={ipo.minAmount} closesLabel={closes}
            lotSize={ipo.lotSize} priceMax={ipo.priceBandMax ?? ipo.priceBandMin}
            subscribedX={ipo.status === 'open' ? ipo.subscriptionTimes : undefined}
            bidOpen={(ipo as any).extra?.startBid === true}
            lang={lang} langQuery={q}
          />
        </aside>
      </div>

      {/* sticky bottom bar (mobile) */}
      <ApplyBar
        symbol={ipo.symbol} status={ipo.status}
        priceLabel={priceBand(ipo.priceBandMin, ipo.priceBandMax)}
        bidOpen={(ipo as any).extra?.startBid === true}
        lang={lang} langQuery={q}
      />
    </article>
  );
}

