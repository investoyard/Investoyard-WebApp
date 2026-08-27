'use client';
import { useEffect, useState } from 'react';
import type { IpoFull } from '@/lib/api';
import { priceBand, inr } from '@/lib/format';
import { IpoLogo } from '@/components/IpoLogo';
import { Icon } from '@/components/Icon';
import { CountdownDial } from '@/components/CountdownDial';
import { useTenant } from '@/components/TenantProvider';
import { useStore, store } from '@/lib/store';
import * as calc from '@/lib/ipoCalc';
import { MON, catColor, shC, fmtDate, relText, segLabel, segTextColor } from '@/lib/catColor';
import { makeT, Lang } from '@investoyard/i18n';
import { LABEL, titleCase, shortName } from '@investoyard/shared-types';

type Topic = 'gmp' | 'reservation' | 'lot' | 'timeline' | 'sub';

/**
 * The third KPI tile, cycling Min Application → GMP → …
 *
 * Sir asked for one of the four tiles to carry GMP without adding a fifth, so
 * this slot alternates instead of splitting the row. It degrades to a plain
 * static tile whenever there is only one value to show — no GMP entered, or the
 * tenant has GMP switched off — and holds still under prefers-reduced-motion,
 * where a tile that changes under the reader is actively unhelpful.
 */
function RotatingSpec({ faces }: { faces: { k: string; v: string; gain?: boolean }[] }) {
  const [i, setI] = useState(0);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    if (faces.length < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      setFade(true);
      // swap at the midpoint of the cross-fade so neither value is seen mid-flip
      setTimeout(() => { setI((n) => (n + 1) % faces.length); setFade(false); }, 220);
    }, 4000);
    return () => clearInterval(t);
  }, [faces.length]);

  const f = faces[Math.min(i, faces.length - 1)];
  return (
    <div className={`hi ic-rot${fade ? ' out' : ''}`}>
      <span className="k">{f.k}{faces.length > 1 && <i className="ic-rotdots" aria-hidden>{faces.map((_, n) => <b key={n} className={n === i ? 'on' : ''} />)}</i>}</span>
      <span className={`v mono${f.gain ? ' gain' : ''}`}>{f.v}</span>
    </div>
  );
}

/** ISO "2026-07-01" → friendly range. Deterministic (no Date.now) → hydration-safe. */
function fmtRange(open?: string, close?: string): string {
  const p = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? { y: +s.slice(0, 4), m: +s.slice(5, 7) - 1, d: +s.slice(8, 10) } : null);
  const a = p(open), b = p(close);
  const f = (x: { y: number; m: number; d: number }) => `${String(x.d).padStart(2, '0')} ${MON[x.m]} ${x.y}`;
  if (!a && !b) return '—';
  if (a && b) return `${f(a)} – ${f(b)}`;
  return f(a ?? b!);
}

/** Share the IPO detail link (native share sheet, else copy to clipboard). */
function shareIpo(ipo: IpoFull) {
  if (typeof window === 'undefined') return;
  const url = `${window.location.origin}/ipos/${ipo.symbol}`;
  const nav = window.navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) nav.share({ title: ipo.name, url }).catch(() => {});
  else nav.clipboard?.writeText(url).catch(() => {});
}

/** "Opens in Nd" for upcoming cards — mirrors the subscription slot. Client-only (hydration-safe). */
function OpensIn({ ipo }: { ipo: IpoFull }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, []);
  if (now === null || !ipo.openDate) return null;
  const diff = new Date(ipo.openDate + 'T10:00:00').getTime() - now;
  if (diff <= 0) return null;
  const d = Math.ceil(diff / 86400000);
  return <span className="ic-opens">Opens in <b>{d}d</b></span>;
}

/** Urgency cue next to the CTA — client-only so it never mismatches on hydration.
 *  Silent on the last day: the "Closing today" status chip already carries it. */
function CloseHint({ ipo }: { ipo: IpoFull }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, []);
  if (now === null || !ipo.closeDate) return null;
  const diff = new Date(ipo.closeDate + 'T17:00:00').getTime() - now;
  if (diff <= 0) return null;
  const d = Math.ceil(diff / 86400000);
  if (d <= 1) return null;
  return (
    <span className={`ic-urg ${d <= 2 ? 'soon' : ''}`}>
      <Icon name="clock" size={13} strokeWidth={2} />
      Closes in {d}d
    </span>
  );
}

const dayIso = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const daysFromToday = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s)
  ? Math.round((new Date(`${s}T00:00:00`).getTime() - new Date(`${dayIso()}T00:00:00`).getTime()) / 86400000)
  : null);

/**
 * ONE time-aware status chip per card (calm & data-clear: a single precise
 * signal, never a badge pile). Live states carry a soft pulse dot.
 */
export function statusChip(ipo: IpoFull): { label: string; cls: string; pulse?: boolean } {
  const today = dayIso();
  if (ipo.status === 'listed') return { label: 'Listed', cls: 'listed' };
  if (ipo.status === 'withdrawn') return { label: 'Withdrawn', cls: 'closed' };
  if (ipo.status === 'closed') {
    const ad = daysFromToday(ipo.allotmentDate);
    if (ad != null && ad <= 0) return { label: 'Allotment Out', cls: 'allot' };
    return { label: 'Awaiting Allotment', cls: 'closed' };
  }
  if (ipo.status === 'open') {
    if (ipo.closeDate === today) return { label: 'Closing Today', cls: 'closing', pulse: true };
    if (ipo.openDate === today) return { label: 'Open Today', cls: 'opentoday', pulse: true };
    return { label: 'Live', cls: 'live', pulse: true };
  }
  if ((ipo as any).extra?.startBid === true) return { label: 'Pre Apply', cls: 'preapply' };
  const od = daysFromToday(ipo.openDate);
  if (od === 1) return { label: 'Opens Tomorrow', cls: 'soon' };
  if (od != null && od > 1 && od <= 4) return { label: `Opens in ${od}d`, cls: 'soon' };
  return { label: 'Upcoming', cls: 'upcoming' };
}

/**
 * Demand in plain words, calibrated per board (SME oversubscription runs an
 * order of magnitude hotter than Mainboard — same × means different things).
 */
export function demandLabel(subX: number, sme: boolean): { label: string; cls: string } {
  const t = sme ? [1, 10, 50] : [1, 3, 10];
  if (subX < t[0]) return { label: 'building up', cls: 'd0' };
  if (subX < t[1]) return { label: 'steady demand', cls: 'd1' };
  if (subX < t[2]) return { label: 'strong demand', cls: 'd2' };
  return { label: 'exceptional demand', cls: 'd3' };
}

/**
 * @param v2 the layout under review on /home2 — short names, light board
 *           badges, "Exp. Premium" instead of "GMP", and a rotating third KPI.
 *           Omitted everywhere else, so the live card is untouched while the
 *           operator decides between the two.
 */
export function IpoCard({ ipo, lang = 'en', v2 = false }: { ipo: IpoFull; lang?: Lang; v2?: boolean }) {
  const tr = makeT(lang);
  const q = lang !== 'en' ? `?lang=${lang}` : '';
  // Detail pages have real per-locale SEO routes (/hi/ipos/...); app pages keep ?lang=.
  const detailHref = lang === 'en' ? `/ipos/${ipo.symbol}` : `/${lang}/ipos/${ipo.symbol}`;
  const [open, setOpen] = useState<Topic | null>(null);
  // Operator gates: "Start Bid" → Apply (UPI flow) · "Start Printing" → Print PDF (ASBA forms).
  const inWindow = ipo.status === 'open' || ipo.status === 'upcoming';
  const canApply = inWindow && (ipo as any).extra?.startBid === true;
  const canPrint = inWindow && (ipo as any).extra?.startPrint === true;
  const watched = useStore((s) => s.watchlist.includes(ipo.symbol));

  const tenant = useTenant();
  const subX = ipo.subscriptionTimes;
  const demandPct = subX != null ? Math.min(100, (subX / 15) * 100) : 0;
  const heat = subX == null ? '' : subX < 1 ? 'cool' : subX < 3 ? 'ok' : subX < 10 ? 'warm' : 'hot';

  // Listed issues carry the ACTUAL listing price instead of the (now historical) GMP.
  // Price comes from the admin-entered NSE/BSE listing price; gain from the
  // listingGainPct column — each derives the other from the band ceiling.
  const isListed = ipo.status === 'listed';
  const exL: any = (ipo as any).extra ?? {};
  const issueP = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
  const listedP = Number(String(exL.nseListingPrice || exL.bseListingPrice || '').replace(/[^\d.]/g, '')) || 0;
  const listedGain = ipo.listingGainPct ?? (isListed && listedP && issueP ? Math.round(((listedP - issueP) / issueP) * 1000) / 10 : undefined);
  const topics: { key: Topic; label: React.ReactNode }[] = [
    { key: 'reservation', label: LABEL.reservation },
    { key: 'lot', label: 'Lots' },
    // Listed cards drop Timeline (historical by then) so the chip row stays on
    // ONE line and card heights match across the grid.
    ...(!isListed ? [{ key: 'timeline' as Topic, label: 'Timeline' }] : []),
    { key: 'sub', label: 'Subs' },
    // GMP is a per-tenant feature flag (off for regulated / white-label tenants).
    ...(tenant.flags.gmpEnabled || isListed
      ? [{
          key: 'gmp' as Topic,
          label: isListed
            ? <>Listed{listedGain != null ? <> <span className={`gmp-pill ${listedGain >= 0 ? 'gp' : 'gn'}`}>{listedGain >= 0 ? '+' : ''}{Math.round(listedGain * 10) / 10}%</span></> : null}</>
              : ipo.gmp != null
              ? <>{v2 ? 'Exp. Premium' : 'GMP'} <span className={`gmp-pill ${ipo.gmp >= 0 ? 'gp' : 'gn'}`}>{ipo.gmp >= 0 ? '+' : ''}{ipo.gmpPct ?? ipo.gmp}%</span></>
              : (v2 ? 'Exp. Premium' : 'GMP'),
        }]
      : []),
  ];

  return (
    <div className={`ipocard st-${ipo.status}${v2 ? ' v2' : ''}`}>
      <div className="ic-top">
        <IpoLogo logo={ipo.logo} name={ipo.name} size={42} />
        <div className="grow">
          {/* the full legal name stays in the tooltip (and on the detail page) */}
          <a className="ic-name" href={detailHref} title={titleCase(ipo.name)}>
            {v2 ? shortName(ipo.name) : titleCase(ipo.name)}
          </a>
          <div className="ic-meta">
            <span className={`ic-tag ${ipo.type === 'sme' ? 'sme' : 'mb'}`}>{ipo.type === 'sme' ? 'SME' : 'Mainboard'}</span>
            {(() => { const c = statusChip(ipo); return (
              <span className={`ic-status ${c.cls}`}>{c.pulse && <span className="pd" />}{c.label}</span>
            ); })()}
          </div>
        </div>
        <CountdownDial ipo={ipo} />
      </div>

      <div className="ic-keys">
        <span className="ic-dates"><Icon name="calendar" size={13} />{fmtRange(ipo.openDate, ipo.closeDate)}</span>
        {ipo.status === 'open' && <CloseHint ipo={ipo} />}
        {subX != null
          ? (() => { const dm = demandLabel(subX, ipo.type === 'sme'); return (
              <span className={`ic-subx2 ${dm.cls}`}><b className="mono">{subX}×</b> {dm.label}</span>
            ); })()
          : ipo.status === 'upcoming' ? <OpensIn ipo={ipo} /> : null}
      </div>
      {subX != null && (
        <div className="ic-track"><span className={heat} style={{ width: `${Math.max(6, demandPct)}%` }} /></div>
      )}

      <div className="ic-specs">
        <div><span className="k">{LABEL.offerPrice}</span><span className="v mono">{priceBand(ipo.priceBandMin, ipo.priceBandMax)}</span></div>
        <div className="hi"><span className="k">{LABEL.lotSize}</span><span className="v mono">{ipo.lotSize ?? '—'}</span></div>
        {v2 ? (
          <RotatingSpec
            faces={[
              { k: LABEL.minApplication, v: inr(ipo.minAmount) },
              // only joins the rotation when a real value exists — an empty face
              // would blink a dash at the reader every four seconds
              ...(tenant.flags.gmpEnabled && ipo.gmp != null
                ? [{ k: 'Exp. Premium', v: `${ipo.gmp >= 0 ? '+' : ''}₹${ipo.gmp}`, gain: ipo.gmp >= 0 }]
                : []),
            ]}
          />
        ) : (
          <div className="hi"><span className="k">{LABEL.minApplication}</span><span className="v mono">{inr(ipo.minAmount)}</span></div>
        )}
        <div><span className="k">{LABEL.issueSize}</span><span className="v mono">{ipo.issueSize ?? '—'}</span></div>
      </div>

      <div className="ic-topics">
        {topics.map((t) => (
          <button key={t.key} className={`ic-topic ${open === t.key ? 'on' : ''}`} onClick={() => setOpen(open === t.key ? null : t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {open && <TopicPanel k={open} ipo={ipo} tr={tr} />}

      <div className="ic-foot">
        {canApply && (
          <a className="btn ic-apply" href={`/apply/${ipo.symbol}${q}`}>
            {ipo.status === 'upcoming' ? LABEL.preApply : LABEL.applyNow} <Icon name="arrow-right" size={16} />
          </a>
        )}
        {canPrint && (
          // soft light-red CTA — distinct from Apply's indigo
          <a className="btn ic-apply btn-pdf" href={`/print/${ipo.symbol}${q}`}>
            {LABEL.printForms} <Icon name="file-pdf" size={15} />
          </a>
        )}
        {!canApply && !canPrint && (
          statusChip(ipo).cls === 'allot'
            // allotment is out → the card's job changes: help the user check it
            ? <a className="btn ic-apply btn-allot" href={`/allotment${q}`}>{LABEL.checkAllotment} <Icon name="arrow-right" size={15} /></a>
            : <span className="ic-closed">{inWindow ? 'Bidding opens soon' : 'Applications closed'}</span>
        )}
        <span style={{ flex: 1 }} />
        <button className="ghost-btn" aria-label="Share this IPO" onClick={() => shareIpo(ipo)}>
          <Icon name="share" size={16} />
        </button>
        <button className="ghost-btn" aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'} onClick={() => store.toggleWatch(ipo.symbol)} style={watched ? { color: 'var(--brand)', borderColor: 'var(--brand-200)', background: 'var(--brand-50)' } : undefined}>
          <Icon name={watched ? 'star-fill' : 'star'} size={17} />
        </button>
      </div>
    </div>
  );
}

/* ---- topic detail ---- */
function TopicPanel({ k, ipo, tr }: { k: Topic; ipo: IpoFull; tr: (s: string) => string }) {
  // Listed issue → real listing performance replaces the grey-market panel.
  if (k === 'gmp' && ipo.status === 'listed') {
    const ex: any = (ipo as any).extra ?? {};
    const issuePrice = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
    const listingPrice =
      Number(String(ex.nseListingPrice || ex.bseListingPrice || '').replace(/[^\d.]/g, '')) ||
      (ipo.listingGainPct != null && issuePrice ? Math.round(issuePrice * (1 + ipo.listingGainPct / 100)) : 0);
    const gain = ipo.listingGainPct ?? (listingPrice && issuePrice ? Math.round(((listingPrice - issuePrice) / issuePrice) * 1000) / 10 : undefined);
    return (
      <div className="ic-panel">
        <h4>Listing performance</h4>
        <div className="ic-kv"><span>Issue price</span><b className="mono">₹{issuePrice || '—'}</b></div>
        <div className="ic-kv"><span>Listing price</span><b className="mono">{listingPrice ? `₹${listingPrice}` : '—'}</b></div>
        {gain != null && (
          <div className="ic-kv"><span>Listing gain</span><b className={gain >= 0 ? 'gp' : 'gn'}>{gain >= 0 ? '+' : ''}{gain}%</b></div>
        )}
        {!listingPrice && gain == null && <p className="muted" style={{ fontSize: 13 }}>Listing price not entered yet — add it in Admin → GMP &amp; Listing.</p>}
      </div>
    );
  }
  if (k === 'gmp') {
    const upper = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
    const hist = ipo.gmpHistory ?? [];
    const vals = hist.map((x) => x.value);
    const min = Math.min(...vals, 0), max = Math.max(...vals, 1);
    const pts = hist.map((x, i) => `${(4 + (i * 292) / Math.max(1, hist.length - 1)).toFixed(0)},${(44 - ((x.value - min) / Math.max(1, max - min)) * 36).toFixed(1)}`).join(' ');
    return (
      <div className="ic-panel">
        <h4>Grey-market premium</h4>
        {ipo.gmp != null ? (
          <>
            <div className="ic-kv"><span>Premium / share</span><b className={ipo.gmp >= 0 ? 'gp' : 'gn'}>{ipo.gmp >= 0 ? '+' : ''}₹{ipo.gmp}</b></div>
            <div className="ic-kv"><span>GMP %</span><b className={ipo.gmp >= 0 ? 'gp' : 'gn'}>{ipo.gmp >= 0 ? '+' : ''}{ipo.gmpPct ?? '—'}%</b></div>
            <div className="ic-kv"><span>Est. listing price</span><b className="mono">₹{upper + ipo.gmp}</b></div>
            {hist.length > 1 && (
              <svg width="100%" height="46" viewBox="0 0 300 46" preserveAspectRatio="none" style={{ marginTop: 8 }}>
                <polyline points={pts} fill="none" stroke={ipo.gmp >= 0 ? 'var(--pos)' : 'var(--neg)'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </>
        ) : <p className="muted" style={{ fontSize: 13 }}>No grey-market data yet.</p>}
        <p className="disclaimer">⚠ {tr('detail.disclaimer')}</p>
      </div>
    );
  }
  if (k === 'reservation') {
    const rows = calc.reservation(ipo);
    return (
      <div className="ic-panel">
        <h4>Issue reservation {ipo.issueSize && <span className="p-meta">{ipo.issueSize}</span>}</h4>
        {rows.length ? (
          <>
            <div className="alloc">
              {rows.map((r) => (
                <span key={r.cat} style={{ flex: Math.max(0.001, r.pct), background: catColor(r.cat), color: segTextColor(r.cat) }} title={`${r.cat} · ${r.pct}%`}>
                  {segLabel(r.cat, r.pct, true)}
                </span>
              ))}
            </div>
            <div className="alloc-legend">
              {rows.map((r) => (
                <div className="al" key={r.cat}>
                  <span className="swatch" style={{ background: catColor(r.cat) }} />
                  <div className="al-txt"><div className="who">{r.cat}</div><div className="num">{shC(r.shares)} sh · {calc.crOrInr(r.amount)}</div></div>
                  <span className="pct">{r.pct}%</span>
                </div>
              ))}
            </div>
          </>
        ) : <p className="muted" style={{ fontSize: 13 }}>Category-wise reservation not announced yet.</p>}
      </div>
    );
  }
  if (k === 'lot') {
    const rows = calc.lotLadder(ipo);
    const groups: { cat: string; sub: string; min: calc.LotRow; max: calc.LotRow }[] = [];
    for (const r of rows) {
      const g = groups.find((x) => x.cat === r.cat);
      if (!g) groups.push({ cat: r.cat, sub: r.sub, min: r, max: r });
      else { if (r.lots < g.min.lots) g.min = r; if (r.lots > g.max.lots) g.max = r; }
    }
    return (
      <div className="ic-panel">
        <h4>Lot ladder by category {ipo.lotSize && <span className="p-meta">1 lot = {ipo.lotSize} shares</span>}</h4>
        {groups.length ? (
          <div className="lots">
            {groups.map((g) => {
              const single = g.min.lots === g.max.lots;
              return (
                <div className="lotcard" key={g.cat} style={{ ['--ccolor' as string]: catColor(g.cat) } as React.CSSProperties}>
                  <div className="lc-hdr">
                    <span className="lc-who">{g.cat} <span className="lc-band">· {g.sub}</span></span>
                    <span className="lc-tag">{single ? `${g.min.lots}+ lots` : `${g.min.lots}–${g.max.lots} lots`}</span>
                  </div>
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
        ) : <p className="muted" style={{ fontSize: 13 }}>Lot size not available.</p>}
      </div>
    );
  }
  if (k === 'timeline') {
    const items = calc.timeline(ipo);
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();
    const parsed = items.map((x) => ({ ...x, ms: /^\d{4}-\d{2}-\d{2}$/.test(x.date ?? '') ? new Date(x.date + 'T00:00:00').getTime() : null }));
    let nowIdx = parsed.findIndex((p) => p.ms == null || p.ms >= today);
    if (nowIdx === -1) nowIdx = parsed.length; // all done
    return (
      <div className="ic-panel">
        <h4>Timeline</h4>
        <div className="ic-rail">
          {parsed.map((p, i) => {
            const st = i < nowIdx ? 'done' : i === nowIdx ? 'now' : '';
            return (
              <div className={`rn ${st}`} key={p.label}>
                <div className="rn-col1"><span className="rn-conn" /><span className="rn-node">
                  {st === 'done' ? <Icon name="check" size={13} strokeWidth={3} /> : st === 'now' ? <Icon name="clock" size={12} strokeWidth={2.2} /> : null}
                </span></div>
                <div className="rn-body">
                  <div><div className="rn-lbl">{p.label}</div><div className="rn-rel">{relText(p.ms, today, i < nowIdx)}</div></div>
                  <span className="rn-dt">{fmtDate(p.date)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  const t = calc.subscriptionTable(ipo);
  return (
    <div className="ic-panel">
      <h4>Subscription by category</h4>
      {t ? (
        <>
          <div className="ic-subs">
            {t.rows.map((r) => {
              const under = r.times < 1;
              const w = Math.max(4, Math.min(100, (r.times / 15) * 100));
              return (
                <div className={`sm ${under ? 'under' : ''}`} key={r.cat} style={{ ['--ccolor' as string]: catColor(r.cat) } as React.CSSProperties}>
                  <div className="sm-who">{r.cat}</div>
                  <div className="sm-barwrap">
                    <div className="sm-track"><div className="sm-fill" style={{ width: `${w}%` }} /></div>
                    <div className="sm-book">book {shC(r.bookSize)} · applied {shC(r.subscribed)}</div>
                  </div>
                  <div className="sm-x">{r.times}×<small>{under ? 'UNDER' : 'SUB'}</small></div>
                </div>
              );
            })}
          </div>
          <div className="sm-total"><span>Total subscription</span><span className="sm-tx">{t.total.times}×</span></div>
        </>
      ) : <p className="muted" style={{ fontSize: 13 }}>Subscription not open yet.</p>}
    </div>
  );
}
