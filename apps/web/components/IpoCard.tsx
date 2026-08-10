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

type Topic = 'gmp' | 'reservation' | 'lot' | 'timeline' | 'sub';

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

/** Urgency cue next to the CTA — client-only so it never mismatches on hydration. */
function CloseHint({ ipo }: { ipo: IpoFull }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, []);
  if (now === null || !ipo.closeDate) return null;
  const diff = new Date(ipo.closeDate + 'T17:00:00').getTime() - now;
  if (diff <= 0) return null;
  const d = Math.ceil(diff / 86400000);
  const soon = d <= 2;
  return (
    <span className={`ic-urg ${soon ? 'soon' : ''}`}>
      <Icon name="clock" size={13} strokeWidth={2} />
      {d <= 1 ? 'Closes today' : `Closes in ${d}d`}
    </span>
  );
}

export function IpoCard({ ipo, lang = 'en' }: { ipo: IpoFull; lang?: Lang }) {
  const tr = makeT(lang);
  const q = lang !== 'en' ? `?lang=${lang}` : '';
  // Detail pages have real per-locale SEO routes (/hi/ipos/...); app pages keep ?lang=.
  const detailHref = lang === 'en' ? `/ipos/${ipo.symbol}` : `/${lang}/ipos/${ipo.symbol}`;
  const [open, setOpen] = useState<Topic | null>(null);
  const canApply = ipo.status === 'open' || ipo.status === 'upcoming';
  const watched = useStore((s) => s.watchlist.includes(ipo.symbol));

  const tenant = useTenant();
  const subX = ipo.subscriptionTimes;
  const demandPct = subX != null ? Math.min(100, (subX / 15) * 100) : 0;
  const heat = subX == null ? '' : subX < 1 ? 'cool' : subX < 3 ? 'ok' : subX < 10 ? 'warm' : 'hot';

  // Listed issues carry the ACTUAL listing price instead of the (now historical) GMP.
  const isListed = ipo.status === 'listed';
  const topics: { key: Topic; label: React.ReactNode }[] = [
    { key: 'reservation', label: 'Reserve' },
    { key: 'lot', label: 'Lots' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'sub', label: 'Subs' },
    // GMP is a per-tenant feature flag (off for regulated / white-label tenants).
    ...(tenant.flags.gmpEnabled || isListed
      ? [{
          key: 'gmp' as Topic,
          label: isListed
            ? <>Listed{ipo.listingGainPct != null ? <> <span className={ipo.listingGainPct >= 0 ? 'gp' : 'gn'}>{ipo.listingGainPct >= 0 ? '+' : ''}{ipo.listingGainPct}%</span></> : null}</>
            : ipo.gmp != null ? <>GMP <span className={ipo.gmp >= 0 ? 'gp' : 'gn'}>{ipo.gmp >= 0 ? '+' : ''}{ipo.gmpPct ?? ipo.gmp}%</span></> : 'GMP',
        }]
      : []),
  ];

  return (
    <div className={`ipocard st-${ipo.status}`}>
      <div className="ic-top">
        <IpoLogo logo={ipo.logo} name={ipo.name} size={42} />
        <div className="grow">
          <a className="ic-name" href={detailHref}>{ipo.name}</a>
          <div className="ic-meta">
            <span className={`ic-tag ${ipo.type === 'sme' ? 'sme' : 'mb'}`}>{ipo.type === 'sme' ? 'SME' : 'Mainboard'}</span>
            <span className={`ic-dot ${ipo.status}`}>{tr(`status.${ipo.status}`)}</span>
          </div>
        </div>
        <CountdownDial ipo={ipo} />
      </div>

      <div className="ic-keys">
        <span className="ic-dates"><Icon name="calendar" size={13} />{fmtRange(ipo.openDate, ipo.closeDate)}</span>
        {subX != null
          ? <span className="ic-subx mono">{subX}× <small>subscribed</small></span>
          : ipo.status === 'upcoming' ? <OpensIn ipo={ipo} /> : null}
      </div>
      {subX != null && (
        <div className="ic-track"><span className={heat} style={{ width: `${Math.max(6, demandPct)}%` }} /></div>
      )}

      <div className="ic-specs">
        <div><span className="k">Price band</span><span className="v mono">{priceBand(ipo.priceBandMin, ipo.priceBandMax)}</span></div>
        <div className="hi"><span className="k">Lot size</span><span className="v mono">{ipo.lotSize ?? '—'}</span></div>
        <div className="hi"><span className="k">Min invest</span><span className="v mono">{inr(ipo.minAmount)}</span></div>
        <div><span className="k">Issue size</span><span className="v mono">{ipo.issueSize ?? '—'}</span></div>
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
        {canApply
          ? <a className="btn ic-apply" href={`/apply/${ipo.symbol}${q}`}>Apply now <Icon name="arrow-right" size={16} /></a>
          : <span className="ic-closed">Applications closed</span>}
        {ipo.status === 'open' && <CloseHint ipo={ipo} />}
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
    return (
      <div className="ic-panel">
        <h4>Listing performance</h4>
        <div className="ic-kv"><span>Issue price</span><b className="mono">₹{issuePrice || '—'}</b></div>
        <div className="ic-kv"><span>Listing price</span><b className="mono">{listingPrice ? `₹${listingPrice}` : '—'}</b></div>
        {ipo.listingGainPct != null && (
          <div className="ic-kv"><span>Listing gain</span><b className={ipo.listingGainPct >= 0 ? 'gp' : 'gn'}>{ipo.listingGainPct >= 0 ? '+' : ''}{ipo.listingGainPct}%</b></div>
        )}
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
