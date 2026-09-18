'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getIpos, type IpoFull } from '@/lib/api';
import { subscriptionTable, lotLadder, type SubRowT, subCatLabel } from '@/lib/ipoCalc';
import { IpoLogo } from '@/components/IpoLogo';
import { Icon } from '@/components/Icon';
import { statusChip } from '@/components/IpoCard';
import { SubscriptionDisclaimer } from '@/components/SubscriptionDisclaimer';
import { titleCase, shortName } from '@investoyard/shared-types';

/**
 * Subscription Hub v2 — /subscription
 *
 * Ports the finalized design at ipoSubscription_iy_v2.html (operator-approved
 * 2026-09-18) into production. Per-IPO card = summary row (avatar, name,
 * meta chips, big times, meter, book/subscribed/apps tiles, share button) +
 * three detail panels: Share-wise (4-col table matching operator screenshot),
 * Application-wise (6-col ipopremium-style breakup), Lot ladder. Filter row
 * above the list: All / Closing today / Mainboard / SME. Auto-refreshes the
 * IPO list every 60 s while the page is open.
 *
 * Category dots and category labels come from shared helpers (`catColor`
 * via CSS vars, `subCatLabel`) — the palette is uniform with IpoCard and the
 * detail page's reservation / lots panels.
 */

type Filter = 'all' | 'closing' | 'mainboard' | 'sme';
type ViewMode = 'full' | 'appwise';

const tone = (t: number): 'hot' | 'warm' | 'cool' | 'cold' =>
  t >= 2 ? 'hot' : t >= 1 ? 'warm' : t > 0 ? 'cool' : 'cold';
const toneLabel = (t: number) =>
  t >= 2 ? 'Oversubscribed' : t >= 1 ? 'Fully subscribed' : t > 0 ? 'In progress' : 'Awaiting bids';

const fmtIn = (n: number) => Math.round(n).toLocaleString('en-IN');
/** "₹1644 Cr" for large, "₹32.15 Cr" for small — matches the ipopremium sample. */
const fmtCr = (n: number) => `₹${n >= 1000 ? Math.round(n).toLocaleString('en-IN') : n.toFixed(2)} Cr`;

/** "18-Sep-2026 4:16 PM" — the exact datetime format sir chose. */
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

/** "16-18 Sep" for a single-month range, "30 Sep – 3 Oct" across months, "18 Sep" for one day. */
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

/** Today in IST as `YYYY-MM-DD`. */
function istTodayYmd(): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const dotClassFor = (key: string): string =>
  ['qib', 'hni', 'hni2', 'retail', 'emp', 'shareholder'].includes(key)
    ? key
    : key === 'employee' ? 'emp' : '';

const isOpenLive = (i: IpoFull) =>
  i.status === 'open' && ((i.subscription?.length ?? 0) > 0 || i.subscriptionTimes != null);

export function SubscriptionHub({ ipos: baked }: { ipos: IpoFull[] }) {
  const [ipos, setIpos] = useState<IpoFull[]>(baked);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<ViewMode>('full');
  const [search, setSearch] = useState('');
  const [shareTarget, setShareTarget] = useState<IpoFull | null>(null);
  // The share-canvas is a child component that owns its own ref; we lift the
  // DOM node up via useState so html2canvas can point at it, and so the
  // reference itself is mutable (useRef's `.current` is readonly under
  // strict typing when initialised with `null`).
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);

  // Live refresh — swap the baked SSG payload for a live one on mount, and
  // keep it fresh every minute (matches SubscriptionHub v1 cadence).
  useEffect(() => {
    let alive = true;
    const load = () => getIpos().then((live) => { if (alive && Array.isArray(live) && live.length) setIpos(live as IpoFull[]); }).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Keyboard shortcut — "/" focuses search unless a field is already focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toUpperCase();
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) searchRef.current?.blur();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const today = istTodayYmd();
  const openList = useMemo(() => ipos.filter(isOpenLive), [ipos]);
  const counts = useMemo(() => ({
    all: openList.length,
    closing: openList.filter((i) => i.closeDate === today).length,
    mainboard: openList.filter((i) => i.type === 'mainboard').length,
    sme: openList.filter((i) => i.type === 'sme').length,
  }), [openList, today]);

  const filtered = useMemo(() => {
    let l = openList;
    if (filter === 'closing') l = l.filter((i) => i.closeDate === today);
    if (filter === 'mainboard' || filter === 'sme') l = l.filter((i) => i.type === filter);
    const q = search.trim().toLowerCase();
    if (q) l = l.filter((i) => `${i.name} ${i.symbol ?? ''}`.toLowerCase().includes(q));
    // Default order: most subscribed first (matches design's default sort).
    return l.slice().sort((a, b) => (b.subscriptionTimes ?? 0) - (a.subscriptionTimes ?? 0));
  }, [openList, filter, search, today]);

  // Board groupings — sections vanish when their bucket is empty in the
  // current filter, so a "Closing today · Mainboard only" view doesn't leave
  // an empty SME header hanging.
  const mb = filtered.filter((i) => i.type === 'mainboard');
  const sme = filtered.filter((i) => i.type === 'sme');

  const showToast = useCallback((msg: string) => {
    const el = toastRef.current;
    if (!el) return;
    const span = el.querySelector('span'); if (span) span.textContent = msg;
    el.classList.add('show');
    window.setTimeout(() => el.classList.remove('show'), 2200);
  }, []);

  const onShare = useCallback(async (ipo: IpoFull) => {
    setShareTarget(ipo);
    // Let React paint the off-screen canvas before snapping it.
    await new Promise((r) => setTimeout(r, 30));
    try {
      showToast('Preparing snapshot…');
      const h2c = await ensureHtml2Canvas();
      const node = canvasEl;
      if (!h2c || !node) throw new Error('canvas not ready');
      const canvas: HTMLCanvasElement = await h2c(node, { backgroundColor: '#ffffff', scale: 2 });
      canvas.toBlob(async (blob: Blob | null) => {
        if (!blob) { showToast('Snapshot failed'); return; }
        const name = shortName(titleCase(ipo.name)).replace(/[^\w-]+/g, '_');
        const file = new File([blob], `${name}.png`, { type: 'image/png' });
        // Prefer native share on mobile / clipboard on desktop, download as fallback.
        const nav = navigator as any;
        if (nav.canShare && nav.canShare({ files: [file] })) {
          try { await nav.share({ files: [file], title: ipo.name, text: 'Live IPO subscription — Investoyard' }); showToast('Shared'); return; } catch { /* fall through */ }
        }
        try {
          await (navigator.clipboard as any).write([new (window as any).ClipboardItem({ 'image/png': blob })]);
          showToast('Copied to clipboard');
        } catch {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${name}.png`;
          a.click();
          showToast('Downloaded');
        }
      });
    } catch {
      showToast('Snapshot failed');
    } finally {
      // Keep the target briefly so async toBlob has time to serialize, then clear.
      window.setTimeout(() => setShareTarget(null), 800);
    }
  }, [showToast, canvasEl]);

  return (
    <div className="subv2">
      <div className="subv2-filters">
        <div className="subv2-seg" role="tablist" aria-label="Filter">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')} type="button">
            All <span className="c">{counts.all}</span>
          </button>
          <button className={filter === 'closing' ? 'on' : ''} onClick={() => setFilter('closing')} type="button">
            Closing today <span className="c">{counts.closing}</span>
          </button>
          <button className={filter === 'mainboard' ? 'on' : ''} onClick={() => setFilter('mainboard')} type="button">
            Mainboard <span className="c">{counts.mainboard}</span>
          </button>
          <button className={filter === 'sme' ? 'on' : ''} onClick={() => setFilter('sme')} type="button">
            SME <span className="c">{counts.sme}</span>
          </button>
        </div>
        <div className="subv2-viewseg" role="tablist" aria-label="View mode">
          <button className={view === 'full' ? 'on' : ''} onClick={() => setView('full')} type="button">Full view</button>
          <button className={view === 'appwise' ? 'on' : ''} onClick={() => setView('appwise')} type="button">Application-wise</button>
        </div>
        <div className="subv2-search">
          <Icon name="search" size={14} />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company or symbol…"
            aria-label="Search IPOs"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="subv2-empty">
          <h3>{filter === 'closing' ? 'Nothing closes today' : 'No live IPO right now'}</h3>
          <p className="muted">
            {filter === 'closing'
              ? 'Try All or Mainboard/SME to see other open issues.'
              : 'Check the calendar for what opens next.'}
          </p>
        </div>
      ) : view === 'appwise' ? (
        /* Page-level Application-wise report — one compact card per open IPO
           with just the app-wise table + header. The full breakdown lives on
           each IPO's summary card in Full view; this view is the cross-issue
           report the operator asked for. */
        <AppWisePage ipos={filtered} today={today} />
      ) : (
        <>
          {(filter === 'all' || filter === 'mainboard' || filter === 'closing') && mb.length > 0 && (
            <section>
              <SectionHead label="Mainboard" boardClass="" count={mb.length} />
              <div className="subv2-list">
                {mb.map((i) => <IpoRow key={i.id} ipo={i} today={today} onShare={onShare} />)}
              </div>
            </section>
          )}
          {(filter === 'all' || filter === 'sme' || filter === 'closing') && sme.length > 0 && (
            <section>
              <SectionHead label="SME" boardClass="sme" count={sme.length} />
              <div className="subv2-list">
                {sme.map((i) => <IpoRow key={i.id} ipo={i} today={today} onShare={onShare} />)}
              </div>
            </section>
          )}
        </>
      )}

      {/* Off-screen 1080-wide snapshot rendered on demand. Populated with the
          share-target IPO's data; html2canvas rasterises then removes it. */}
      {shareTarget && <ShareCanvas ipo={shareTarget} onRef={setCanvasEl} />}
      <div ref={toastRef} className="subv2-toast" aria-live="polite">
        <Icon name="check" size={14} />
        <span>Saved</span>
      </div>
      <SubscriptionDisclaimer />
    </div>
  );
}

function SectionHead({ label, boardClass, count }: { label: string; boardClass: string; count: number }) {
  return (
    <div className="subv2-sec-head">
      <h3><span className={`subv2-board-badge ${boardClass}`}>{label}</span></h3>
      <span className="count">{count} live</span>
      <span className="hair" />
    </div>
  );
}

export function IpoRow({ ipo, today, onShare }: { ipo: IpoFull; today: string; onShare?: (i: IpoFull) => void }) {
  const table = subscriptionTable(ipo);
  const t = table?.total.times ?? ipo.subscriptionTimes ?? 0;
  const tc = tone(t);
  const closingToday = ipo.closeDate === today;
  const price = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
  const bookCr = table ? (table.total.bookSize * price) / 1e7 : 0;
  const subCr = table ? (table.total.subscribed * price) / 1e7 : 0;
  const totalApps = table?.total.bidCount ?? 0;
  const meterPct = Math.min(100, (t / 3) * 100);
  const priceBand = ipo.priceBandMin && ipo.priceBandMax
    ? `₹${ipo.priceBandMin}–₹${ipo.priceBandMax}`
    : (ipo.priceBandMax ?? ipo.priceBandMin) ? `₹${ipo.priceBandMax ?? ipo.priceBandMin}` : '';
  const dates = fmtDateRange(ipo.openDate, ipo.closeDate);
  const asOf = fmtDateTime((ipo as any).subscriptionAsOf);
  const displayName = shortName(titleCase(ipo.name));

  return (
    <div className="subv2-card">
      <article className={`subv2-ln subv2-t-${tc}`}>
        {/* Updated stamp — absolute top-right (see .subv2-updated CSS). Sits
            beside the share button, gets its own line on narrow widths. */}
        {asOf && <span className="subv2-updated" title={`Last poll at ${asOf}`}>Updated {asOf}</span>}
        <div className="subv2-ln-l">
          <div className="subv2-avatar"><IpoLogo logo={(ipo as any).logo} name={ipo.name} size={46} /></div>
          <div className="subv2-ln-name">
            <h3 title={titleCase(ipo.name)}>{displayName}</h3>
            {/* Row 1 — board + status chips using the SITE-WIDE ic-tag / ic-status
                families (same as IpoCard and IpoDetailView). Closing Today / Open
                Today / Live are all derived by statusChip() so the palette stays
                uniform with the rest of the site. */}
            <div className="subv2-ln-meta">
              <span className={`ic-tag ${ipo.type === 'sme' ? 'sme' : 'mb'}`}>{ipo.type === 'sme' ? 'SME' : 'Mainboard'}</span>
              {(() => {
                const c = statusChip(ipo);
                return (
                  <span className={`ic-status ${c.cls}`}>
                    {c.pulse && <span className="pd" />}
                    {c.label}
                  </span>
                );
              })()}
            </div>
            {/* Row 2 — discrete info pills for dates / price band / lot.
                Updated timestamp lives at the card's top-right (see .subv2-updated
                further down in this row). Symbol removed per operator feedback. */}
            <div className="subv2-ln-info">
              {dates && <span className="subv2-info-pill"><span className="k">IPO</span>{dates}</span>}
              {priceBand && <span className="subv2-info-pill"><span className="k">Price</span>{priceBand}</span>}
              {ipo.lotSize && <span className="subv2-info-pill"><span className="k">Lot</span>{ipo.lotSize}</span>}
            </div>
          </div>
        </div>
        <div className="subv2-ln-m">
          <div className="subv2-ln-times">
            <span className="tx-n">{t.toFixed(2)}</span><span className="tx-x">×</span>
          </div>
          <div className="subv2-ln-meter">
            <div className="subv2-ln-track"><span style={{ width: `${meterPct}%` }} /></div>
            <div className="subv2-ln-tk"><span>0×</span><span>1×</span><span>2×</span><span>3×+</span></div>
          </div>
          <div className="subv2-ln-status">{toneLabel(t)}</div>
        </div>
        <div className="subv2-ln-r">
          <div><span className="k">Book</span><span className="v">{bookCr > 0 ? fmtCr(bookCr) : '—'}</span></div>
          <div><span className="k">Subscribed</span><span className={`v tone-${tc}`}>{subCr > 0 ? fmtCr(subCr) : '—'}</span></div>
          <div><span className="k">Applications</span><span className="v">{totalApps > 0 ? fmtIn(totalApps) : '—'}</span></div>
        </div>
        {onShare && (
          <div className="subv2-ln-act">
            <button className="subv2-share" type="button" title="Share snapshot" aria-label={`Share ${ipo.name}`} onClick={() => onShare(ipo)}>
              <Icon name="share" size={14} />
            </button>
          </div>
        )}
      </article>
      {table && (
        <div className="subv2-ln-detail">
          <div className="subv2-det-in">
            {/* Three panels SIDE BY SIDE (operator ask round-3 correction,
                2026-09-18). Lot ladder is now compact enough (3 rows, 3 cols
                with two-line cells) to sit as its own column alongside
                Share-wise and Application-wise. */}
            <ShareWisePanel rows={table.rows} total={table.total} price={price} />
            <AppWisePanel rows={table.rows} />
            <LotLadderPanel ipo={ipo} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Share-wise panel — 4-col table matching the operator screenshot. Each cell
 *  under Book Size / Subscription shows shares (big) + ₹ Cr (small).
 *
 *  Row order (2026-09-18 spec): QIB · **HNI (combined, pastel bg)** · HNI (10L+) ·
 *  HNI (2-10L) · Retail · Employee · Shareholder · Total. The combined HNI row
 *  is the synthetic `nii` row from the API — kept when both split rows are
 *  present (see subscriptionTable) and rendered with the `combo` class for
 *  the pastel indigo background. Sub-rows are NOT indented (operator ask). */
const SHARE_ORDER: Record<string, number> = { qib: 0, nii: 1, hni: 2, hni2: 3, retail: 4, employee: 5, shareholder: 6 };
export function ShareWisePanel({ rows, total, price }: { rows: SubRowT[]; total: SubRowT; price: number }) {
  const cr = (shares: number) => (price > 0 ? (shares * price) / 1e7 : 0);
  const cell = (shares: number) => (
    <div className="subv2-2l">
      <span className="big">{fmtIn(shares)}</span>
      {price > 0 && <span className="small">{fmtCr(cr(shares))}</span>}
    </div>
  );
  // Sort rows into canonical order; unknown categories fall to the end.
  const ordered = rows.slice().sort((a, b) => {
    const ai = SHARE_ORDER[a.key ?? ''] ?? 99;
    const bi = SHARE_ORDER[b.key ?? ''] ?? 99;
    return ai - bi;
  });
  return (
    <section className="subv2-det-panel">
      <header>
        <h4>Share-wise</h4>
        <span className="muted">by category</span>
      </header>
      <div className="subv2-tbl-wrap">
        <table className="subv2-tbl">
          <thead><tr><th>Category</th><th>Book Size</th><th>Subscription</th><th>No. of Times</th></tr></thead>
          <tbody>
            {ordered.map((r) => {
              // `nii` = the API's synthetic combined-HNI bucket. Renders as a
              // plain "HNI" row (no highlight) — the highlight now lives on
              // the two SPLIT rows (hni + hni2), which read as sub-categories.
              const isCombo = r.key === 'nii';
              const isSubcat = r.key === 'hni' || r.key === 'hni2';
              const label = isCombo ? 'HNI' : r.cat;
              const dotKey = isCombo ? 'hni' : dotClassFor(r.key ?? '');
              return (
                <tr key={r.key} className={isSubcat ? 'subcat' : undefined}>
                  <td><span className={`subv2-dot ${dotKey}`} /><b>{label}</b></td>
                  <td>{cell(r.bookSize)}</td>
                  <td>{cell(r.subscribed)}</td>
                  <td className={`tone-${tone(r.times)}`}><b>{r.times.toFixed(2)}×</b></td>
                </tr>
              );
            })}
            <tr className="tot">
              <td>Total</td>
              <td>{cell(total.bookSize)}</td>
              <td>{cell(total.subscribed)}</td>
              <td className={`tone-${tone(total.times)}`}><b>{total.times.toFixed(2)}×</b></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Application-wise panel — compact 4-col breakup after operator round-3
 *  polish (2026-09-18): Category · Req 1× · Total · Times. NSE and BSE
 *  per-exchange split dropped (still in the DB / Share-wise NSE-vs-BSE %
 *  footnote); Total moved AFTER Req 1× so the reader compares
 *  "needed for 1×" against "came in". */
export function AppWisePanel({ rows }: { rows: SubRowT[] }) {
  const APP_ORDER: Record<string, number> = { hni: 0, hni2: 1, retail: 2, employee: 3 };
  const appRows = rows
    .filter((r) => r.applicationsTimes != null && r.bidCount != null && r.key != null && r.key in APP_ORDER)
    .sort((a, b) => APP_ORDER[a.key!] - APP_ORDER[b.key!]);
  if (appRows.length === 0) return null;
  const totalApps = appRows.reduce((s, r) => s + (r.bidCount ?? 0), 0);
  return (
    <section className="subv2-det-panel">
      <header>
        <h4>Application-wise</h4>
      </header>
      <div className="subv2-tbl-wrap">
        <table className="subv2-tbl">
          <thead><tr><th>Category</th><th>Req 1×</th><th>Total</th><th>Times</th></tr></thead>
          <tbody>
            {appRows.map((r) => {
              // req1x now sourced from subscriptionTable() with the correct
              // per-bucket divisor (HNI ÷ sHNI-min, Retail ÷ lotSize). No
              // more bidCount ÷ applicationsTimes back-derivation.
              const req1x = r.req1x ?? 0;
              return (
                <tr key={r.key}>
                  <td><span className={`subv2-dot ${dotClassFor(r.key ?? '')}`} /><b>{r.cat}</b></td>
                  <td>{req1x > 0 ? fmtIn(req1x) : '—'}</td>
                  <td><b>{fmtIn(r.bidCount ?? 0)}</b></td>
                  <td className={`tone-${tone(r.applicationsTimes ?? 0)}`}><b>{(r.applicationsTimes ?? 0).toFixed(2)}×</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 10.5, marginTop: 8 }}>Total applications: <b>{fmtIn(totalApps)}</b></p>
    </section>
  );
}

/** Lot ladder panel — 3-col table with two-line cells (operator round-3 spec,
 *  2026-09-18). Each cell has upper (min value) and lower (max value), and
 *  the range label lives UNDER the category name. Full rupees always, no
 *  L/Cr abbreviation — sir's ask.
 *
 *      Category         Lot & Share        Amount
 *      Retail           1–13               ₹14,850
 *      (min–max)        150–1,950 sh       ₹1,93,050
 *
 *      HNI (2+)         14–66              ₹2,07,900
 *      (min–max)        2,100–9,900 sh     ₹9,94,950
 *
 *      HNI (10+)        67                 ₹10,02,300
 *      (min)            10,050 sh          —              ← min-only, no max
 *
 *  The shared `lotLadder(ipo)` helper returns 5 flat rows (Retail min, Retail
 *  max, S-HNI min, S-HNI max, B-HNI min); we collapse them here. */
export function LotLadderPanel({ ipo }: { ipo: IpoFull }) {
  const rows = lotLadder(ipo);
  if (rows.length < 5) return null;
  const [rMin, rMax, sMin, sMax, bMin] = rows;
  /** Full-rupee format ("₹14,850", "₹10,02,300") — Indian comma grouping, no
   *  L/Cr abbreviation. Sir explicitly asked for the actual figure. */
  const rupees = (n: number): string => n > 0 ? `₹${Math.round(n).toLocaleString('en-IN')}` : '—';
  interface Cell {
    label: string;
    sub: string;
    lotsUp: string;    // upper line — lots range (or single value)
    sharesLow: string; // lower line — shares range (or single value)
    amountUp: string;  // upper line — min amount
    amountLow: string; // lower line — max amount, blank string for min-only rows
  }
  const cells: Cell[] = [
    {
      label: 'Retail', sub: '(min–max)',
      lotsUp: `${rMin.lots}–${rMax.lots}`,
      sharesLow: `${fmtIn(rMin.shares)}–${fmtIn(rMax.shares)} sh`,
      amountUp: rupees(rMin.amount),
      amountLow: rupees(rMax.amount),
    },
    {
      label: 'HNI (2+)', sub: '(min–max)',
      lotsUp: `${sMin.lots}–${sMax.lots}`,
      sharesLow: `${fmtIn(sMin.shares)}–${fmtIn(sMax.shares)} sh`,
      amountUp: rupees(sMin.amount),
      amountLow: rupees(sMax.amount),
    },
    {
      // min-only bucket — lower line empty in Amount (Q4 answer). Lots/shares
      // upper-lower still both present because we have both values (one lot
      // count, its share equivalent).
      label: 'HNI (10+)', sub: '(min)',
      lotsUp: `${bMin.lots}`,
      sharesLow: `${fmtIn(bMin.shares)} sh`,
      amountUp: rupees(bMin.amount),
      amountLow: '',
    },
  ];
  return (
    <section className="subv2-det-panel">
      <header>
        <h4>Lot ladder</h4>
      </header>
      <div className="subv2-tbl-wrap">
        <table className="subv2-tbl">
          <thead><tr><th>Category</th><th>Lot &amp; Share</th><th>Amount</th></tr></thead>
          <tbody>
            {cells.map((r) => (
              <tr key={r.label}>
                <td>
                  <div className="subv2-ll-cat">
                    <b>{r.label}</b>
                    <small>{r.sub}</small>
                  </div>
                </td>
                <td>
                  <div className="subv2-2l">
                    <span className="big">{r.lotsUp}</span>
                    <span className="small">{r.sharesLow}</span>
                  </div>
                </td>
                <td>
                  <div className="subv2-2l">
                    <span className="big">{r.amountUp}</span>
                    {r.amountLow && <span className="small">{r.amountLow}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Page-level Application-wise report — one compact card per open IPO, each
 *  card = header (avatar + name + board / status chips + updated) + 6-col
 *  application-wise table (HNI 10L+ / HNI 2-10L / Retail / Employee) + total
 *  applications line. Operator ask (2026-09-18): a cross-issue app-wise view
 *  is a report the reader wants in one scroll, not per-card. */
function AppWisePage({ ipos, today }: { ipos: IpoFull[]; today: string }) {
  const withData = ipos
    .map((i) => {
      const table = subscriptionTable(i);
      const APP_ORDER: Record<string, number> = { hni: 0, hni2: 1, retail: 2, employee: 3 };
      const appRows = table?.rows
        .filter((r) => r.applicationsTimes != null && r.bidCount != null && r.key != null && r.key in APP_ORDER)
        .sort((a, b) => APP_ORDER[a.key!] - APP_ORDER[b.key!]) ?? [];
      return { ipo: i, appRows };
    })
    .filter((x) => x.appRows.length > 0);

  if (withData.length === 0) {
    return (
      <div className="subv2-empty">
        <h3>No application-wise data yet</h3>
        <p className="muted">The poller will populate this view once open IPOs record bids at the exchange.</p>
      </div>
    );
  }

  return (
    <div className="subv2-aw-page">
      {withData.map(({ ipo, appRows }) => {
        const totalApps = appRows.reduce((s, r) => s + (r.bidCount ?? 0), 0);
        const asOf = fmtDateTime((ipo as any).subscriptionAsOf);
        const isClosing = ipo.closeDate === today;
        void isClosing; // silence unused-flag warning; statusChip reads closeDate itself
        return (
          <div className="subv2-aw-card" key={ipo.id}>
            {asOf && <span className="subv2-updated" title={`Last poll at ${asOf}`}>Updated {asOf}</span>}
            <div className="subv2-aw-head">
              <div className="subv2-avatar"><IpoLogo logo={(ipo as any).logo} name={ipo.name} size={34} /></div>
              <div className="subv2-aw-head-title">
                <h3 title={titleCase(ipo.name)}>{shortName(titleCase(ipo.name))}</h3>
                <div className="subv2-aw-head-chips">
                  <span className={`ic-tag ${ipo.type === 'sme' ? 'sme' : 'mb'}`}>{ipo.type === 'sme' ? 'SME' : 'Mainboard'}</span>
                  {(() => {
                    const c = statusChip(ipo);
                    return (
                      <span className={`ic-status ${c.cls}`}>
                        {c.pulse && <span className="pd" />}
                        {c.label}
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="subv2-tbl-wrap">
              <table className="subv2-tbl">
                <thead><tr><th>Category</th><th>Req 1×</th><th>Total</th><th>Times</th></tr></thead>
                <tbody>
                  {appRows.map((r) => {
                    const req1x = r.req1x ?? 0;
                    return (
                      <tr key={r.key}>
                        <td><span className={`subv2-dot ${dotClassFor(r.key ?? '')}`} /><b>{r.cat}</b></td>
                        <td>{req1x > 0 ? fmtIn(req1x) : '—'}</td>
                        <td><b>{fmtIn(r.bidCount ?? 0)}</b></td>
                        <td className={`tone-${tone(r.applicationsTimes ?? 0)}`}><b>{(r.applicationsTimes ?? 0).toFixed(2)}×</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="subv2-aw-total">Total applications: <b>{fmtIn(totalApps)}</b></p>
          </div>
        );
      })}
    </div>
  );
}

/** Off-screen 1080-wide canvas rendered on-demand while snapshotting. Colours
 *  are inlined in the CSS block (not var()) so html2canvas gets identical pixels
 *  regardless of light/dark theme. Owns its own ref and hands the DOM node up
 *  via `onRef` so the parent can point html2canvas at it. */
function ShareCanvas({ ipo, onRef }: { ipo: IpoFull; onRef: (el: HTMLDivElement | null) => void }) {
  const localRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    onRef(localRef.current);
    return () => onRef(null);
  }, [onRef]);
  const table = subscriptionTable(ipo);
  const t = table?.total.times ?? ipo.subscriptionTimes ?? 0;
  const tc = tone(t);
  const price = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
  const tHex = tc === 'hot' ? '#0f9d58' : tc === 'warm' ? '#e6ad12' : tc === 'cool' ? '#c58a00' : '#d92d20';
  const tBg = tc === 'hot' ? '#e6f6ee' : tc === 'warm' ? '#fff7df' : tc === 'cool' ? '#fff5d9' : '#fdece9';
  const snapshotAt = fmtDateTime(new Date().toISOString());
  const appRows = table ? table.rows.filter((r) => r.applicationsTimes != null && r.bidCount != null && (r.key === 'hni' || r.key === 'hni2' || r.key === 'retail' || r.key === 'employee')) : [];
  const cellPair = (shares: number) => price > 0 ? `${fmtIn(shares)}` : `${fmtIn(shares)}`;
  const cellCr = (shares: number) => price > 0 ? fmtCr((shares * price) / 1e7) : '—';
  return (
    <div ref={localRef} className="subv2-canvas" aria-hidden="true">
      <div className="sc-inner">
        <div className="sc-head">
          <div className="sc-brand">Investoyard</div>
          <div className="sc-kicker">Live IPO Subscription</div>
        </div>
        <div className="sc-hero-row">
          <div className="sc-hero">
            <span className={`sc-tag ${ipo.type === 'sme' ? 'sme' : 'mb'}`}>{ipo.type === 'sme' ? 'SME IPO' : 'Mainboard IPO'}</span>
            <h1 className="sc-name">{shortName(titleCase(ipo.name))}</h1>
          </div>
          <div className="sc-hero-r">
            <div className="sc-times" style={{ color: tHex }}>
              <span className="n">{t.toFixed(2)}</span><span className="x">×</span>
            </div>
            <div className="sc-status" style={{ color: tHex, background: tBg }}>{toneLabel(t)}</div>
          </div>
        </div>

        {table && (
          <section className="sc-section">
            <h3>Share-Wise Subscription</h3>
            <table className="sc-tbl">
              <thead><tr><th>Category</th><th>Shares</th><th>Book</th><th>Subs</th><th>Sub ₹</th><th>Times</th></tr></thead>
              <tbody>
                {table.rows.map((r) => {
                  const key = dotClassFor(r.key ?? '');
                  return (
                    <tr key={r.key}>
                      <td><span className={`sc-cat-dot ${key}`} />{r.cat}</td>
                      <td>{cellPair(r.bookSize)}</td>
                      <td>{cellCr(r.bookSize)}</td>
                      <td>{cellPair(r.subscribed)}</td>
                      <td>{cellCr(r.subscribed)}</td>
                      <td style={{ color: (tone(r.times) === 'hot' ? '#0f9d58' : tone(r.times) === 'warm' ? '#e6ad12' : tone(r.times) === 'cool' ? '#c58a00' : '#d92d20'), fontWeight: 800 }}>{r.times.toFixed(2)}×</td>
                    </tr>
                  );
                })}
                <tr className="sc-tot">
                  <td>Total</td>
                  <td>{fmtIn(table.total.bookSize)}</td>
                  <td>{cellCr(table.total.bookSize)}</td>
                  <td>{fmtIn(table.total.subscribed)}</td>
                  <td>{cellCr(table.total.subscribed)}</td>
                  <td>{t.toFixed(2)}×</td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {appRows.length > 0 && (
          <section className="sc-section">
            <h3>Application-Wise</h3>
            <table className="sc-tbl">
              <thead><tr><th>Category</th><th>NSE</th><th>BSE</th><th>Total</th><th>Req 1×</th><th>Times</th></tr></thead>
              <tbody>
                {appRows.map((r) => {
                  const req1x = r.req1x ?? 0;
                  return (
                    <tr key={r.key}>
                      <td><span className={`sc-cat-dot ${dotClassFor(r.key ?? '')}`} />{r.cat}</td>
                      <td>{r.nseBids != null ? fmtIn(r.nseBids) : '—'}</td>
                      <td>{r.bseBids != null ? fmtIn(r.bseBids) : '—'}</td>
                      <td style={{ fontWeight: 800 }}>{fmtIn(r.bidCount ?? 0)}</td>
                      <td>{req1x > 0 ? fmtIn(req1x) : '—'}</td>
                      <td style={{ color: (tone(r.applicationsTimes ?? 0) === 'hot' ? '#0f9d58' : tone(r.applicationsTimes ?? 0) === 'warm' ? '#e6ad12' : tone(r.applicationsTimes ?? 0) === 'cool' ? '#c58a00' : '#d92d20'), fontWeight: 800 }}>{(r.applicationsTimes ?? 0).toFixed(2)}×</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        <footer className="sc-foot">
          <span className="sc-time">Snapshot · {snapshotAt}</span>
          <span className="sc-url">investoyard.com</span>
        </footer>
      </div>
    </div>
  );
}

// Silence the eslint no-unused about subCatLabel (imported so the module barrel
// stays intact if the panel later opts into rich labels for legacy rows).
void subCatLabel;

/** Lazy-load html2canvas from CDN once. Same version the design HTML uses. */
async function ensureHtml2Canvas(): Promise<any> {
  const w = window as any;
  if (w.html2canvas) return w.html2canvas;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('html2canvas load failed'));
    document.head.appendChild(s);
  });
  return w.html2canvas;
}
