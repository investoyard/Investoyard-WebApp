'use client';
import { useEffect, useMemo, useState } from 'react';
import { getIpos, type IpoFull } from '@/lib/api';
import { subscriptionTable } from '@/lib/ipoCalc';
import { IpoLogo } from '@/components/IpoLogo';
import { ShareWisePanel, AppWisePanel, LotLadderPanel } from '@/components/SubscriptionHub';
import { titleCase } from '@investoyard/shared-types';

/**
 * NseIpoLanding — single-issue landing page for the National Stock Exchange
 * of India IPO (symbol `NSE`). Rendered at /subscription/v2.
 *
 * Layout (top → bottom):
 *   1. HERO band — logo, name, board + status chips, big × value with a
 *      circular gauge arc, closing-in countdown, live-poll pulse
 *   2. KPI strip — Price band · Lot · Book · Subscribed · Applications
 *   3. Split main — Share-wise panel (wider) + Application-wise + Lot ladder
 *      (right column stacked). Panels are the same components /subscription
 *      already uses, so numbers can't drift between the two pages.
 *   4. About / disclaimer strip
 *
 * Auto-refreshes the live payload every 60 s while the page is open.
 */
export function NseIpoLanding({ ipo: baked }: { ipo: IpoFull | null }) {
  const [ipo, setIpo] = useState<IpoFull | null>(baked);

  // Live refresh — the SSG page ships with whatever the last build captured;
  // client re-fetches on mount + every minute to catch new poll cycles.
  useEffect(() => {
    let alive = true;
    const load = () => getIpos().then((live) => {
      if (!alive || !Array.isArray(live)) return;
      const nse = live.find((i: any) => (i.symbol ?? '').toUpperCase() === 'NSE');
      if (nse) setIpo(nse as IpoFull);
    }).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!ipo) {
    return (
      <div className="nsev2">
        <div className="nsev2-empty">
          <h2>NSE IPO not open right now</h2>
          <p className="muted">
            The National Stock Exchange of India IPO isn&apos;t in the live catalogue at the moment.
            Live subscription for this issue will appear here once it opens.
          </p>
          <p style={{ marginTop: 14 }}>
            <a className="linklike" href="/subscription">Browse all open IPOs →</a>
          </p>
        </div>
      </div>
    );
  }

  return <NseIpoLandingBody ipo={ipo} />;
}

function NseIpoLandingBody({ ipo }: { ipo: IpoFull }) {
  const table = useMemo(() => subscriptionTable(ipo), [ipo]);
  const t = table?.total.times ?? ipo.subscriptionTimes ?? 0;
  const tc = tone(t);
  const price = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
  const bookCr = table ? (table.total.bookSize * price) / 1e7 : 0;
  const subCr = table ? (table.total.subscribed * price) / 1e7 : 0;
  const totalApps = table?.total.bidCount ?? 0;
  const asOf = fmtDateTime((ipo as any).subscriptionAsOf);
  const countdown = closeInLabel(ipo.closeDate);
  const priceBand = ipo.priceBandMin && ipo.priceBandMax
    ? `₹${ipo.priceBandMin}–₹${ipo.priceBandMax}`
    : (ipo.priceBandMax ?? ipo.priceBandMin) ? `₹${ipo.priceBandMax ?? ipo.priceBandMin}` : '—';
  const dates = fmtDateRange(ipo.openDate, ipo.closeDate);
  const closingToday = ipo.closeDate === istTodayYmd();
  const statusLabel = closingToday ? 'Closing Today' : ipo.status === 'open' ? 'Live' : 'Not open';
  const statusCls = closingToday ? 't-closing solid' : ipo.status === 'open' ? 't-live' : '';

  return (
    <div className="nsev2">
      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className={`nsev2-hero nsev2-t-${tc}`}>
        <div className="nsev2-hero-in">
          <div className="nsev2-hero-brand">
            <div className="nsev2-hero-logo">
              <IpoLogo logo={(ipo as any).logo} name={ipo.name} size={72} />
            </div>
            <div className="nsev2-hero-title">
              <div className="nsev2-hero-eyebrow">Live Subscription · IPO {ipo.symbol}</div>
              <h1>{titleCase(ipo.name)}</h1>
              <div className="nsev2-hero-chips">
                <span className={`ic-tag ${ipo.type === 'sme' ? 'sme' : 'mb'}`}>{ipo.type === 'sme' ? 'SME' : 'Mainboard'}</span>
                {statusLabel && (
                  <span className={`ic-status ${statusCls}`}>
                    <span className="pd" />{statusLabel}
                  </span>
                )}
                {dates && <span className="nsev2-hero-dates">{dates}</span>}
              </div>
            </div>
          </div>

          <div className="nsev2-hero-live">
            <Gauge times={t} tone={tc} />
            <div className="nsev2-hero-status">{toneLabel(t)}</div>
            <div className="nsev2-hero-meta">
              {asOf && <span className="nsev2-hero-pulse">Updated {asOf}</span>}
              {countdown && <span className="nsev2-hero-count">Closes in <b>{countdown}</b></span>}
            </div>
          </div>
        </div>
      </section>

      {/* ── KPI STRIP ────────────────────────────────────────────── */}
      <section className="nsev2-kpi-strip">
        <Kpi k="Price band" v={priceBand} />
        <Kpi k="Lot size" v={ipo.lotSize != null ? `${ipo.lotSize} sh` : '—'} />
        <Kpi k="Issue size" v={ipo.issueSize ?? '—'} />
        <Kpi k="Book" v={bookCr > 0 ? fmtCr(bookCr) : '—'} />
        <Kpi k="Subscribed" v={subCr > 0 ? fmtCr(subCr) : '—'} tone={tc} />
        <Kpi k="Applications" v={totalApps > 0 ? fmtIn(totalApps) : '—'} />
      </section>

      {/* ── SPLIT MAIN ───────────────────────────────────────────── */}
      {table ? (
        <section className="nsev2-split">
          <div className="nsev2-share">
            <ShareWisePanel rows={table.rows} total={table.total} price={price} />
          </div>
          <div className="nsev2-side">
            <AppWisePanel rows={table.rows} />
            <LotLadderPanel ipo={ipo} />
          </div>
        </section>
      ) : (
        <section className="nsev2-nodata">
          <p className="muted">Category-wise subscription figures appear here once the poller writes them (10:00–17:00 IST).</p>
        </section>
      )}

      {/* ── ABOUT / SOURCE ───────────────────────────────────────── */}
      <section className="nsev2-about">
        <p>
          Figures are polled from NSE catwise + BSE demandschedule and refreshed every minute
          while the market window is open (10:00–17:00 IST). The subscription-times denominator is the
          operator-entered reservation table on this IPO&apos;s record; if a category shows «—», the
          reservation figure for that bucket hasn&apos;t been entered yet.
        </p>
      </section>
    </div>
  );
}

/** Compact KPI tile — key label above, big value below. */
function Kpi({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="nsev2-kpi">
      <span className="k">{k}</span>
      <span className={`v${tone ? ` tone-${tone}` : ''}`}>{v}</span>
    </div>
  );
}

/** Semi-circular gauge — 180° arc, track behind + active fill. Times value
 *  centered. Fill % = clamp(times/5, 0, 1) so 5× fills the arc. */
function Gauge({ times, tone }: { times: number; tone: string }) {
  const cx = 100, cy = 100, r = 80;
  const f = Math.max(0, Math.min(1, times / 5));
  const angle = Math.PI * f; // 0 = at start (left, 180°), π = at end (right, 0°)
  const ex = cx - r * Math.cos(angle);
  const ey = cy - r * Math.sin(angle);
  const trackId = 'nsev2-grad-' + tone;
  return (
    <div className="nsev2-gauge">
      <svg viewBox="0 0 200 120" role="img" aria-label={`Subscription ${times.toFixed(2)}x`}>
        <defs>
          <linearGradient id={trackId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--pos)" />
            <stop offset="60%" stopColor="var(--gold-600)" />
            <stop offset="100%" stopColor="var(--gold)" />
          </linearGradient>
        </defs>
        {/* track */}
        <path d="M 20 100 A 80 80 0 0 1 180 100" stroke="var(--border-2)" strokeWidth="10" fill="none" strokeLinecap="round" />
        {/* fill — only draw if we have any times value */}
        {f > 0 && (
          <path
            d={`M 20 100 A 80 80 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`}
            stroke={`url(#${trackId})`}
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="nsev2-gauge-value">
        <span className="n">{times.toFixed(2)}</span>
        <span className="x">×</span>
      </div>
    </div>
  );
}

// ─── helpers (kept local — same tone/label vocabulary as SubscriptionHub) ─────
const tone = (t: number): 'hot' | 'warm' | 'cool' | 'cold' =>
  t >= 2 ? 'hot' : t >= 1 ? 'warm' : t > 0 ? 'cool' : 'cold';
const toneLabel = (t: number) =>
  t >= 2 ? 'Oversubscribed' : t >= 1 ? 'Fully subscribed' : t > 0 ? 'In progress' : 'Awaiting bids';
const fmtIn = (n: number) => Math.round(n).toLocaleString('en-IN');
const fmtCr = (n: number) => `₹${n >= 1000 ? Math.round(n).toLocaleString('en-IN') : n.toFixed(2)} Cr`;

const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const mo = MONS[d.getMonth()];
  const yr = d.getFullYear();
  let hr = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const ampm = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12; if (hr === 0) hr = 12;
  return `${day}-${mo}-${yr} ${hr}:${min} ${ampm}`;
}

function fmtDateRange(openIso?: string, closeIso?: string): string {
  if (!openIso && !closeIso) return '';
  const p = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(s + 'T00:00:00') : null);
  const o = p(openIso); const c = p(closeIso);
  if (o && c) {
    if (o.getMonth() === c.getMonth() && o.getFullYear() === c.getFullYear()) {
      return `${o.getDate()}–${c.getDate()} ${MONS[c.getMonth()]}`;
    }
    return `${o.getDate()} ${MONS[o.getMonth()]} – ${c.getDate()} ${MONS[c.getMonth()]}`;
  }
  const one = o ?? c!;
  return `${one.getDate()} ${MONS[one.getMonth()]}`;
}

/** "2d 23h" until IST market close on closeDate. Static — recomputed on the
 *  60-s auto-refresh, not ticking every second. */
function closeInLabel(closeDate?: string): string | null {
  if (!closeDate || !/^\d{4}-\d{2}-\d{2}/.test(closeDate)) return null;
  // IST market close = 17:00 on closeDate. IST = UTC+5:30.
  const close = new Date(closeDate + 'T17:00:00+05:30');
  const now = new Date();
  const diff = close.getTime() - now.getTime();
  if (diff <= 0) return null; // already closed — hide the countdown
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function istTodayYmd(): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
