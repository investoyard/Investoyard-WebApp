'use client';
import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { getIpos, type IpoFull } from '@/lib/api';
import { subscriptionTable, lotLadder, type SubRowT, type AnchorBasis, subCatLabel } from '@/lib/ipoCalc';
import { IpoLogo } from '@/components/IpoLogo';
import { Icon } from '@/components/Icon';
import { statusChip } from '@/components/IpoCard';
import { SubscriptionDisclaimer } from '@/components/SubscriptionDisclaimer';
import { DayWiseSubscription } from '@/components/DayWiseSubscription';
import { Modal } from '@/components/ui/Modal';
import { VisitorBeacon } from '@/components/VisitorBeacon';
import { titleCase, shortName, fmtDateTime, appWiseRows } from '@investoyard/shared-types';

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

/*
 * THE ONE SUBSCRIPTION-TONE LADDER, exported because the detail page kept
 * its own and the two disagreed about the same issue (operator report,
 * 2026-10-21). At JPL’s 3.00× this said **Oversubscribed** while
 * `LiveSubscription` said **Heavily subscribed** — and worse, between 2×
 * and 3× the COLOURS disagreed too, hot green here against warm amber
 * there, so one issue was painted two ways. Same reasoning as
 * `demandWord()` / `demandTier()` in format.ts: a vocabulary read by more
 * than one surface belongs in exactly one place.
 *
 * This copy is canonical because three surfaces already read it — the hub
 * cards, /subscription/v2 and the shared image — and only the detail page
 * differed.
 */
export const tone = (t: number): 'hot' | 'warm' | 'cool' | 'cold' =>
  t >= 2 ? 'hot' : t >= 1 ? 'warm' : t > 0 ? 'cool' : 'cold';
export const toneLabel = (t: number) =>
  t >= 2 ? 'Oversubscribed' : t >= 1 ? 'Fully subscribed' : t > 0 ? 'In progress' : 'Awaiting bids';

const fmtIn = (n: number) => Math.round(n).toLocaleString('en-IN');
/** "₹1644 Cr" for large, "₹32.15 Cr" for small — matches the ipopremium sample. */
const fmtCr = (n: number) => `₹${n >= 1000 ? Math.round(n).toLocaleString('en-IN') : n.toFixed(2)} Cr`;


/* `fmtDateTime` ("18-Sep-2026 4:16 PM", the format sir chose) moved to
   shared-types on 2026-09-28 — the IPO card's subscription tooltip needs the
   identical string and was printing a date-only version of the same instant. */
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
/** Today in IST as YYYY-MM-DD. Exported because three surfaces need it —
 *  the hub, `/subscription/v2` and the admin Subscription Report — and a
 *  local copy per surface is the shape that produced the two-tone-ladder bug. */
export function istTodayYmd(): string {
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

/**
 * THE TWO RATIO COLUMNS OF THE APPLICATION-WISE TABLE, AND WHAT A PRO-RATA
 * ROW PUTS IN THEM (operator ask, 2026-10-21).
 *
 * `Req 1x` and `Times` answer 'what are my chances', which is a question
 * about a DRAW. Retail is drawn; employee, shareholder and policyholder are
 * allotted proportionately, so there the share-wise multiple decides an
 * allotment and the application count decides nothing. JPL showed the cost:
 * its employee quota is OVER-subscribed at 1.08x by shares while this table
 * read 0.16x in a low-demand tone, so the two panels on one screen pointed
 * opposite ways with the colour on the misleading one.
 *
 * NA IS NOT A DASH, and the distinction is deliberate — it follows the `na`
 * check state in `ipo-completeness`: 'not applicable' is a different
 * statement from 'not known', and a dash alone in BOTH cells would read as a
 * gap somebody forgot to fill. The operator asked for NA on the count and a
 * dash on the multiple.
 *
 * These live here rather than inside one panel because this file renders the
 * table THREE times — the live panel, the Application-wise cards view, and
 * the share snapshot — and the share snapshot had already drifted its own
 * copy of the row filter (see ShareCanvas).
 */
const appReq1xText = (r: SubRowT): string => (r.proRata ? 'NA' : fmtIn(r.req1x ?? 0));
const appTimesText = (r: SubRowT): string => (r.proRata ? '\u2014' : `${(r.applicationsTimes ?? 0).toFixed(2)}\u00d7`);
/** Tone class for the Times cell — none on a dash, which has no magnitude. */
const appToneCls = (r: SubRowT): string => (r.proRata ? '' : `tone-${tone(r.applicationsTimes ?? 0)}`);
/**
 * The footnote, or NA is a mystery. It names the rows actually on screen
 * rather than the category list, so it can never mention a quota this issue
 * does not have.
 */
const proRataNote = (rows: readonly SubRowT[]): string | null => {
  const names = rows.filter((r) => r.proRata).map((r) => r.cat);
  if (!names.length) return null;
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return `${who} ${names.length > 1 ? 'are' : 'is'} allotted pro-rata, so an application-wise multiple does not apply \u2014 the share-wise figure is what decides an allotment there.`;
};

const isOpenLive = (i: IpoFull) =>
  i.status === 'open' && ((i.subscription?.length ?? 0) > 0 || i.subscriptionTimes != null);

export function SubscriptionHub({ ipos: baked }: { ipos: IpoFull[] }) {
  const [ipos, setIpos] = useState<IpoFull[]>(baked);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<ViewMode>('full');
  const [search, setSearch] = useState('');
  const [shareTarget, setShareTarget] = useState<IpoFull | null>(null);
  // Day-wise opens in a modal on this page rather than sending the reader to
  // /subscription/v2 (operator ask, 2026-09-23). No fetch is needed: subLog
  // and subLogHour already ride along on every IPO from `getIpos()`.
  const [dayWise, setDayWise] = useState<IpoFull | null>(null);
  // THE SHARE CANVAS IS A REF, NOT STATE, AND THAT DISTINCTION WAS THE WHOLE
  // BUG. `onShare` CREATES the canvas by calling setShareTarget, so on the
  // click that matters the child has not rendered yet — a value read from
  // state is whatever the RUNNING closure captured, which is `null` every
  // single time. The handler threw 'canvas not ready' before html2canvas was
  // ever reached, so every share since this shipped answered 'Snapshot
  // failed'. Proved rather than reasoned: after a click the off-screen card
  // IS in the DOM from 100ms on, and html2canvas rasterises it fine by hand
  // (2160x2428, 773 KB) — the node was there, the closure could not see it.
  // A ref is dereferenced at call time, so it sees whatever the last render
  // put there.
  //
  // The note that used to sit here said useRef's `.current` is readonly under
  // strict typing. It is not. `useRef<T | null>(null)` returns a
  // MutableRefObject; only `useRef<T>(null)` is readonly. A wrong reason for
  // choosing state is what kept the bug in place.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const setCanvasNode = useCallback((el: HTMLDivElement | null) => { canvasRef.current = el; }, []);
  // Guards a second click while a render is in flight. Only reachable now
  // that sharing works at all, and worth having: the rasterise is slow, so
  // two concurrent passes over one node is an easy thing to trigger.
  const sharingRef = useRef(false);
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
    // CLOSING DATE order — closing today, then tomorrow, and so on (operator
    // ask, 2026-09-23). Deliberately NOT `compareForList`, which the IPO cards
    // use: that ranks by STAGE first, so an issue that opened today and closes
    // on the 25th outranks one closing on the 24th. On a page about who is
    // about to close, the date is the only thing that should decide.
    //
    // Symbol breaks the tie so four issues sharing a close date can't reshuffle
    // between renders; an IPO with no close date sorts last rather than first,
    // which is what an empty string would otherwise do.
    return l.slice().sort((a, b) => {
      const ka = a.closeDate ?? '';
      const kb = b.closeDate ?? '';
      if (ka !== kb) {
        if (!ka) return 1;
        if (!kb) return -1;
        return ka.localeCompare(kb);
      }
      return (a.symbol ?? '').localeCompare(b.symbol ?? '');
    });
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
    if (sharingRef.current) return;
    sharingRef.current = true;
    setShareTarget(ipo);
    // Let React paint the off-screen canvas before snapping it.
    await new Promise((r) => setTimeout(r, 30));
    try {
      showToast('Preparing snapshot…');
      const h2c = await ensureHtml2Canvas();
      const node = canvasRef.current;
      if (!h2c || !node) throw new Error('canvas not ready');
      /* THE SNAPSHOT IS TAKEN FROM THE LIVE DOM, so anything it paints must
         already be ready — html2canvas gets no second chance. Two things are
         not ready at 30ms: the WEBFONT (a paint delay is no guarantee that
         `document.fonts` has resolved, and a fallback face would be baked
         into the PNG for good) and the two logos, one of which is
         CROSS-ORIGIN. Neither may fail the share, so both are best-effort. */
      try { await (document as any).fonts?.ready; } catch { /* no FontFaceSet: the inline family still applies */ }
      const coLogo = (ipo as any).logo as string | undefined;
      await Promise.all([
        preloadImage('/investoyard-logo-light.svg'),
        coLogo ? preloadImage(coLogo, 'anonymous') : Promise.resolve(),
      ]);
      const canvas: HTMLCanvasElement = await h2c(node, {
        backgroundColor: '#ffffff',
        scale: 2,
        /* `useCORS`, NEVER `allowTaint`. The company logo is served from the
           API host, which answers with Access-Control-Allow-Origin for our
           origins (and for localhost, which is what makes this verifiable
           off a local build). `allowTaint` would draw it and then TAINT the
           canvas, so the `toBlob` below would throw and sharing would break
           outright — a worse outcome than a missing logo. */
        useCORS: true,
        imageTimeout: 4000,
      });
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
    } catch (e: any) {
      // Name the reason. The two real failures here are 'the CDN script did
      // not load' and 'html2canvas threw on this node', and a reader can act
      // on the first but not the second.
      const why = String(e?.message ?? e ?? '');
      showToast(/load failed/i.test(why) ? 'Could not load the image tool' : 'Snapshot failed');
      if (why) console.error('[share] snapshot failed:', why);
    } finally {
      sharingRef.current = false;
      // Keep the target briefly so async toBlob has time to serialize, then clear.
      window.setTimeout(() => setShareTarget(null), 800);
    }
  }, [showToast]);

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
                {mb.map((i) => <IpoRow key={i.id} ipo={i} today={today} onShare={onShare} onDayWise={setDayWise} />)}
              </div>
            </section>
          )}
          {(filter === 'all' || filter === 'sme' || filter === 'closing') && sme.length > 0 && (
            <section>
              <SectionHead label="SME" boardClass="sme" count={sme.length} />
              <div className="subv2-list">
                {sme.map((i) => <IpoRow key={i.id} ipo={i} today={today} onShare={onShare} onDayWise={setDayWise} />)}
              </div>
            </section>
          )}
        </>
      )}

      {/* Off-screen 1080-wide snapshot rendered on demand. Populated with the
          share-target IPO's data; html2canvas rasterises then removes it. */}
      {shareTarget && <ShareCanvas ipo={shareTarget} onRef={setCanvasNode} />}
      {dayWise && (
        <Modal
          wide
          title={shortName(titleCase(dayWise.name))}
          sub="Day-wise subscription — click a day for its hourly snapshots"
          onClose={() => setDayWise(null)}
        >
          <DayWiseSubscription
            subLog={subLogOf(dayWise)}
            subLogHour={Array.isArray((dayWise as any).extra?.subLogHour) ? (dayWise as any).extra.subLogHour : []}
            closeDate={dayWise.closeDate}
            bare
          />
          <p style={{ margin: '12px 0 0' }}>
            <a className="linklike" href={`/subscription/v2?symbol=${encodeURIComponent(dayWise.symbol)}`}>
              Open the full page for {shortName(titleCase(dayWise.name))} →
            </a>
          </p>
        </Modal>
      )}
      <div ref={toastRef} className="subv2-toast" aria-live="polite">
        <Icon name="check" size={14} />
        <span>Saved</span>
      </div>
      <SubscriptionDisclaimer />
      {/* Below the content, as asked. The line renders nothing at all until
          there is a real crowd — see SHOW_FROM in VisitorBeacon. */}
      <VisitorBeacon path="/subscription" />
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

/** Day-wise rows the poller has written for this IPO, if any. */
export const subLogOf = (ipo: IpoFull): any[] => {
  const l = (ipo as any).extra?.subLog;
  return Array.isArray(l) ? l : [];
};

export function IpoRow({ ipo, today, onShare, onDayWise, detailLink = true }: {
  ipo: IpoFull;
  today: string;
  onShare?: (i: IpoFull) => void;
  /** The `→` to /subscription/v2. False on that page itself — it is the
   *  detail view, so the arrow would just point at the current page. */
  detailLink?: boolean;
  /** Present only on /subscription, where day-wise opens in a modal instead of
   *  sending the reader to /subscription/v2 (operator ask, 2026-09-23). The
   *  single-issue page omits it — the full table is already below the card. */
  onDayWise?: (i: IpoFull) => void;
}) {
  const table = subscriptionTable(ipo);
  const t = table?.total.times ?? ipo.subscriptionTimes ?? 0;
  const tc = tone(t);
  const closingToday = ipo.closeDate === today;
  const price = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
  /* The Total's rupees are SUMMED from the rows by `subscriptionTable`, never
     shares x the band price: a discounted quota makes those two disagree, and
     the Total is the one row with no price of its own. JPL read ₹22,103 Cr
     over rows summing to ₹22,078 Cr before this. */
  const bookCr = table ? (table.total.bookAmount ?? 0) / 1e7 : 0;
  const subCr = table ? (table.total.subAmount ?? 0) / 1e7 : 0;
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
            {/* IPO name links to the single-issue detail view — operator ask
                2026-09-22: clicking any IPO on /subscription lands on
                /subscription/v2 for that specific IPO with day-wise + hourly
                drill-down. `subv2-name-link` keeps the h3 styling but adds
                hover/focus states appropriate for a link. */}
            <h3 title={titleCase(ipo.name)}>
              <a href={`/subscription/v2?symbol=${encodeURIComponent(ipo.symbol)}`} className="subv2-name-link">
                {displayName}
              </a>
            </h3>
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
        <div className="subv2-ln-act">
          {onShare && (
            <button className="subv2-share" type="button" title="Share snapshot" aria-label={`Share ${ipo.name}`} onClick={() => onShare(ipo)}>
              <Icon name="share" size={14} />
            </button>
          )}
          {/* Day-wise in a modal — so the reader can see the history without
              leaving the hub. Hidden when the poller has written nothing for
              this IPO yet; an empty modal is worse than no button. */}
          {onDayWise && subLogOf(ipo).length > 0 && (
            <button
              className="subv2-share"
              type="button"
              title="Day-wise subscription"
              aria-label={`Day-wise subscription for ${ipo.name}`}
              onClick={() => onDayWise(ipo)}
            >
              <Icon name="chart" size={14} />
            </button>
          )}
          {/* Detail-view link — mirrors tapping the IPO name. Operator ask
              2026-09-22: 'add detail view icon below share button'. Suppressed
              on /subscription/v2, which IS the detail view: there the arrow
              pointed at the page the reader was already on. */}
          {detailLink && (
            <a
              className="subv2-share"
              href={`/subscription/v2?symbol=${encodeURIComponent(ipo.symbol)}`}
              title="Open detail view (day-wise + hourly)"
              aria-label={`Detail view for ${ipo.name}`}
            >
              <Icon name="arrow-right" size={14} />
            </a>
          )}
        </div>
      </article>
      {table && (
        <div className="subv2-ln-detail">
          <div className="subv2-det-in">
            {/* Three panels SIDE BY SIDE (operator ask round-3 correction,
                2026-09-18). Lot ladder is now compact enough (3 rows, 3 cols
                with two-line cells) to sit as its own column alongside
                Share-wise and Application-wise. */}
            <ShareWisePanel rows={table.rows} total={table.total} price={price} anchorDeducted={table.anchorDeducted} anchorBasis={table.anchorBasis} />
            {/*
              * SME SHOWS THIS TOO (operator ask, 2026-10-09). It was hidden on
              * 2026-09-22 on the grounds that SME's application count is
              * "folded into the Lot Ladder's Reserved column, so a separate
              * table would just repeat the same numbers" — and that is true of
              * ONE of the four columns. Reserved IS `req1x`; the panel also
              * carries Total (applications RECEIVED) and Times (the
              * by-applications multiple), and neither appeared anywhere else
              * on an SME page.
              *
              * Safe to show unconditionally: the panel returns null when no row
              * carries a bid count, so an SME issue the exchange gives no
              * application figures for renders nothing rather than an empty
              * table. 4 of the 9 SME issues with subscription rows have them.
              */}
            <AppWisePanel rows={table.rows} />
            <DemandPanel rows={table.rows} total={table.total} price={price} qibSplit={(ipo as any)?.extra?.qibSplit} />
            {/* THE LADDER IS A FULL-WIDTH FOOTER (2026-10-22). It used to sit
                inside a stack beside Application-wise, which meant the DOM met
                it before Demand and a block of `order:` rules had to move it
                visually below 1400px. Last in the DOM, it is last everywhere
                — same reading order the operator asked for, now without the
                workaround, and a screen reader gets it too. It is reference,
                not live figures, so the full width suits it. */}
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
const SHARE_ORDER: Record<string, number> = { qib: 0, nii: 1, hni: 2, hni2: 3, retail: 4, employee: 5, shareholder: 6, policyholder: 7 };
/**
 * THE QIB BOOK SIZE IS NET OF THE ANCHOR, AND THE PANEL NOW SAYS SO — on all
 * three surfaces, because this component is all three (operator ask,
 * 2026-10-10).
 *
 * `subscriptionTable` has deducted the anchor from QIB since 2026-09-21, and
 * the detail page explained it in a footnote of its own — but `/subscription`
 * and `/subscription/v2` render the same deducted number and said NOTHING, so
 * a reader comparing our QIB against the issue's reservation table found it
 * short by the anchor with no explanation on the page. The note lives HERE now,
 * next to the table it describes, and `LiveSubscription` no longer repeats it.
 *
 * TWO WAYS OF SAYING IT, deliberately. The row LABEL reads "QIB (Ex. Anchor)",
 * which is what the exchanges, Chittorgarh and IPOPremium all print, so the
 * number explains itself where it is read; the footnote states which of the
 * three states produced it.
 *
 * THREE STATES, not two. A deduction from a stated share count is the ALLOTMENT
 * off the intimation letter and a reader can check it against the exchange; one
 * from `anchorPct` is our own arithmetic against a ceiling the issue may not
 * have used, so it is an upper bound and not a figure. Both give a net QIB and
 * only one is a fact.
 *
 * NOT THE SAME BASIS AS THE RESERVATION LEGEND, and that is correct rather than
 * a disagreement: the legend shows the FULL QIB quota (the anchor is a
 * sub-allocation of it), this shows what is left for the public book. Labelling
 * this one "(Ex. Anchor)" is what lets a reader reconcile the two.
 */
export function ShareWisePanel({ rows, total, price, anchorDeducted = 0, anchorBasis = null }: {
  rows: SubRowT[]; total: SubRowT; price: number;
  anchorDeducted?: number; anchorBasis?: AnchorBasis;
}) {
  /* Value each row at ITS OWN price. A discounted quota valued at the band
     price reads high — RUNWALENTR's employee book showed ₹3.67 Cr where those
     shares cost ₹3.50 Cr at the discounted ₹291. `r.price` falls back to the
     band price for every category that has no discount, which is all of them
     except employee / shareholder / retail. */
  /* `amount` is the row's own rupee value from `subscriptionTable`, already at
     its own price. It is passed rather than recomputed because the TOTAL row
     cannot be valued at any single price - see the note on SubRowT.bookAmount.
     The shares x price path remains only for a row that carries no amount. */
  const cell = (shares: number, rowPrice?: number, amount?: number) => {
    const px = rowPrice && rowPrice > 0 ? rowPrice : price;
    const cr = amount != null ? amount / 1e7 : px > 0 ? (shares * px) / 1e7 : null;
    return (
      <div className="subv2-2l">
        <span className="big">{fmtIn(shares)}</span>
        {cr != null && <span className="small">{fmtCr(cr)}</span>}
      </div>
    );
  };
  // Sort rows into canonical order; unknown categories fall to the end.
  const ordered = rows.slice().sort((a, b) => {
    const ai = SHARE_ORDER[a.key ?? ''] ?? 99;
    const bi = SHARE_ORDER[b.key ?? ''] ?? 99;
    return ai - bi;
  });
  return (
    <section className="subv2-det-panel pnl-share">
      <header>
        <span className="pnl-ico"><Icon name="pie-fill" size={15} /></span>
        <div className="pnl-ttl">
          <h4>Share-wise</h4>
          <span className="muted">by category</span>
        </div>
      </header>
      <div className="subv2-tbl-wrap">
        {/* `subv2-tbl-share` scopes the phone layout: under 480px this table
            STACKS into one block per category instead of scrolling sideways.
            The other three panels fit at 375px and are left as tables.
            `data-l` supplies the row label the stacked layout prints, so the
            figures are still named once the header row is gone. */}
        <table className="subv2-tbl subv2-tbl-share">
          <thead><tr><th>Category</th><th>Book Size</th><th>Subscription</th><th>No. of Times</th></tr></thead>
          <tbody>
            {ordered.map((r) => {
              // `nii` = the API's synthetic combined-HNI bucket. Renders as a
              // plain "HNI" row (no highlight) — the highlight now lives on
              // the two SPLIT rows (hni + hni2), which read as sub-categories.
              const isCombo = r.key === 'nii';
              const isSubcat = r.key === 'hni' || r.key === 'hni2';
              /* Only when a deduction was actually applied — on a record with no
                 anchor figure the Book Size IS gross and the label would lie. */
              const exAnchor = r.key === 'qib' && anchorDeducted > 0;
              const label = isCombo ? 'HNI' : exAnchor ? 'QIB (Ex. Anchor)' : r.cat;
              const dotKey = isCombo ? 'hni' : dotClassFor(r.key ?? '');
              return (
                <tr key={r.key} className={isSubcat ? 'subcat' : undefined}>
                  <td><span className={`subv2-dot ${dotKey}`} /><b>{label}</b></td>
                  <td data-l="Book size">{cell(r.bookSize, r.price, r.bookAmount)}</td>
                  <td data-l="Subscribed">{cell(r.subscribed, r.price, r.subAmount)}</td>
                  <td className={`tone-${tone(r.times)}`}><b>{r.times.toFixed(2)}×</b></td>
                </tr>
              );
            })}
            <tr className="tot">
              <td>Total</td>
              <td data-l="Book size">{cell(total.bookSize, undefined, total.bookAmount)}</td>
              <td data-l="Subscribed">{cell(total.subscribed, undefined, total.subAmount)}</td>
              <td className={`tone-${tone(total.times)}`}><b>{total.times.toFixed(2)}×</b></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="subv2-note">
        {anchorDeducted <= 0
          ? '*QIB Book Size is Gross — the anchor allocation is not on this record yet.'
          : anchorBasis === 'estimated'
            ? `*QIB Book Size EXCLUDES the anchor portion of ${fmtIn(anchorDeducted)} shares, which is ESTIMATED from the reserved percentage rather than the allotment.`
            : `*QIB Book Size EXCLUDES the anchor portion of ${fmtIn(anchorDeducted)} shares, from the actual anchor allotment.`}
      </p>
    </section>
  );
}

/** Application-wise panel — compact 4-col breakup after operator round-3
 *  polish (2026-09-18): Category · Req 1× · Total · Times. NSE and BSE
 *  per-exchange split dropped (still in the DB / Share-wise NSE-vs-BSE %
 *  footnote); Total moved AFTER Req 1× so the reader compares
 *  "needed for 1×" against "came in". */
export function AppWisePanel({ rows }: { rows: SubRowT[] }) {
  /* THIS TOTAL IS SMALLER THAN THE HEADLINE Applications TILE, BY DESIGN, and
     it is worth knowing before anyone reports it as a mismatch: the tile is
     `total.bidCount`, every category, while `appWiseRows` leaves QIB out —
     institutions bid without a minimum application size, so there is no
     applications-for-1x to divide by. The gap is exactly QIB’s bid count.
     A note saying so was shown on the page for a day and removed at the
     operator’s request (2026-10-23); the arithmetic is unchanged. */
  const appRows = appWiseRows(rows);
  if (appRows.length === 0) return null;
  const totalApps = appRows.reduce((s, r) => s + (r.bidCount ?? 0), 0);
  return (
    <section className="subv2-det-panel pnl-app">
      <header>
        <span className="pnl-ico"><Icon name="doc-fill" size={15} /></span>
        <h4>Application-wise</h4>
      </header>
      <div className="subv2-tbl-wrap">
        <table className="subv2-tbl">
          <thead><tr><th>Category</th><th>Req 1×</th><th>Total</th><th>Times</th></tr></thead>
          <tbody>
            {appRows.map((r) => {
              // req1x from subscriptionTable() — HNI ÷ sHNI-min, Retail ÷ lot,
              // the reserved quotas ÷ one lot. Which categories reach this table
              // at all, and why QIB never does, is `APP_WISE_ORDER` in
              // shared-types/appWise.ts.
              return (
                <tr key={r.key}>
                  <td><span className={`subv2-dot ${dotClassFor(r.key ?? '')}`} /><b>{r.cat}</b></td>
                  <td>{appReq1xText(r)}</td>
                  <td><b>{fmtIn(r.bidCount ?? 0)}</b></td>
                  <td className={appToneCls(r)}><b>{appTimesText(r)}</b></td>
                </tr>
              );
            })}
          </tbody>
          {/*
            * A REAL TOTAL ROW, NOT A MUTED LINE UNDERNEATH (operator ask,
            * 2026-10-21). It reuses `tr.tot` — the same class the Share-wise
            * table's total already carries — so the two tables on one screen
            * end the same way instead of one shouting and one whispering.
            * `tfoot` deliberately, and the class is what carries the padding:
            * `.subv2-tbl tbody td` is scoped to tbody, which is exactly how
            * the partner-api total ended up with its figures out of line.
            *
            * The count sits under TOTAL, the column it is the total of. The
            * two ratio columns are blank because neither sums: Req 1x is a
            * per-category capacity and the multiples are ratios.
            */}
          <tfoot>
            <tr className="tot">
              <td>Total applications</td>
              <td />
              <td><b>{fmtIn(totalApps)}</b></td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {proRataNote(appRows) && (
        <p className="subv2-aw-note">{proRataNote(appRows)}</p>
      )}
    </section>
  );
}

/**
 * SUBSCRIPTION DEMAND, IN ₹ CRORE (operator ask, 2026-10-13, against
 * ipopremium.in/view/subscription).
 *
 * The same four columns as Share-wise, valued in rupees instead of counted in
 * shares. NO NEW ARITHMETIC: `subscriptionTable` already returns book size,
 * subscribed and each row's own price, and Share-wise already prints the ₹ Cr
 * under every share figure. This card is that figure promoted to the headline.
 *
 * EACH ROW AT ITS OWN PRICE, not the band price — the same rule Share-wise
 * follows. A discounted quota valued at the band price reads high: RUNWALENTR's
 * 1,20,275 employee shares are ₹3.50 Cr at ₹291, not ₹3.67 Cr at ₹305.
 *
 * TIMES IS TAKEN FROM `r.times`, NEVER RECOMPUTED FROM THE ₹ FIGURES. The ratio
 * is identical either way — both sides scale by the same price — so the only
 * thing recomputing could add is rounding drift between two cards showing the
 * same issue. One renderer, or two renderers will disagree.
 *
 * WHAT THIS CARD DELIBERATELY DOES NOT HAVE: the reference breaks QIB into
 * FIIs / DIIs / Mutual funds / Others. We store ONE `qib` row — that breakdown
 * is not in our data at all, and inventing it would be fabrication. Adding it
 * is a poller and schema change, not a display one.
 */
/**
 * The QIB institutional split, as the four lines every information site prints.
 *
 * Written by the poller to `extra.qibSplit` from data BOTH exchanges have
 * always sent and we used to discard. It is a PARTITION of the qib row, not an
 * addition to it — probed against the live feed 2026-10-13, where the five
 * exchange codes summed to exactly the qib shares already stored. So the
 * sub-rows are indented UNDER QIB and excluded from the Total, the same way
 * the NII subtotal is never summed alongside bHNI and sHNI.
 *
 * FI and IC are both domestic institutions and share one line, which is why
 * five codes print as four.
 */
export type QibSplit = Partial<Record<'fii' | 'dii' | 'mf' | 'oth', { sh: number; bids: number }>>;

/* The reference's order, and the order a reader expects: foreign, domestic,
   mutual funds, then the remainder. */
const QIB_SUB_ROWS: ReadonlyArray<[keyof QibSplit, string]> = [
  ['fii', 'FIIs'],
  ['dii', 'DIIs'],
  ['mf', 'Mutual funds'],
  ['oth', 'Others'],
];

export function DemandPanel({ rows, total, price, qibSplit }: {
  rows: SubRowT[]; total: SubRowT; price: number; qibSplit?: QibSplit;
}) {
  if (!rows.length) return null;
  const subRows = QIB_SUB_ROWS
    .map(([k, label]) => [label, qibSplit?.[k]?.sh ?? 0] as const)
    .filter(([, sh]) => sh > 0);
  /* Prefer the row's own summed amount; fall back to shares x price only for a
     row that has none. The Total has no single price - see SubRowT.bookAmount. */
  const at = (shares: number, rowPrice?: number, amount?: number) => {
    if (amount != null) return amount / 1e7;
    const px = rowPrice && rowPrice > 0 ? rowPrice : price;
    return px > 0 ? (shares * px) / 1e7 : 0;
  };
  // Same order as Share-wise, so the two cards read as one table in two units.
  const ordered = rows.slice().sort((a, b) => (SHARE_ORDER[a.key ?? ''] ?? 99) - (SHARE_ORDER[b.key ?? ''] ?? 99));
  /* GROUPED, not bare. `toFixed(2)` printed 167140.28, which at five and six
     figures is genuinely hard to read and was the one place a reviewer’s mockup
     was plainly better than the page. `en-IN` so the grouping is the lakh/crore
     one every other figure on this site uses - 1,67,140.28, not 167,140.28.
     Kept local rather than folded into `fmtCr`: this column prints BARE crore
     with no symbol and no rounding, because the panel heading already says
     "in ₹ crore", and `fmtCr` both adds the symbol and rounds above 1000. */
  const cr = (v: number) => (v > 0 ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
  return (
    <section className="subv2-det-panel pnl-demand">
      <header>
        <span className="pnl-ico"><Icon name="users-fill" size={15} /></span>
        <div className="pnl-ttl">
          <h4>Subscription Demand</h4>
          <span className="muted">in ₹ crore</span>
        </div>
      </header>
      <div className="subv2-tbl-wrap">
        <table className="subv2-tbl">
          {/* OFFERED AND TIMES WERE REMOVED ON OPERATOR INSTRUCTION (2026-10-15).
              Both already sit in the Share-wise panel beside this one, and
              `times` is identical in either unit because both sides of the
              ratio scale by the same price — so the two cards were printing
              the same multiple twice and inviting the reader to look for a
              difference that cannot exist. What is left is the one thing only
              this card says: the money actually bid, per category.
              A sub-category keeps no multiple either, for the older reason —
              it has no reserved quota, so there is no denominator to divide by
              and printing one would be inventing it. */}
          <thead><tr><th>Category</th><th>Applied</th></tr></thead>
          <tbody>
            {ordered.map((r) => {
              const isCombo = r.key === 'nii';
              const isSubcat = r.key === 'hni' || r.key === 'hni2';
              return (
                <Fragment key={r.key}>
                  <tr className={isSubcat ? 'subcat' : undefined}>
                    <td><span className={`subv2-dot ${isCombo ? 'hni' : dotClassFor(r.key ?? '')}`} /><b>{isCombo ? 'HNI' : r.cat}</b></td>
                    <td><b>{cr(at(r.subscribed, r.price, r.subAmount))}</b></td>
                  </tr>
                  {r.key === 'qib' && subRows.map(([label, sh]) => (
                    <tr key={label} className="subcat">
                      <td><span className="subv2-dot qib" />{label}</td>
                      <td><b>{cr(at(sh, r.price))}</b></td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            <tr className="tot">
              <td>Total</td>
              <td><b>{cr(at(total.subscribed, total.price, total.subAmount))}</b></td>
            </tr>
          </tbody>
        </table>
      </div>
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
  const isSme = ipo.type === 'sme';
  // SME variant: single row per category with a Reserved column (Req 1× from
  // the subscription table) — operator ask 2026-09-22 matching the reference
  // in ipoSubscription_iy_v2.html:
  //   CATEGORY | LOT(S) | QTY | AMOUNT | RESERVED
  //   INDIVIDUAL  2  2400  ₹2,54,400  405
  //   sHNI        3  3600  ₹3,81,600   39
  //   bHNI        8  9600  ₹10,17,600  77
  if (isSme) {
    if (rows.length < 3) return null;
    const rupees = (n: number): string => n > 0 ? `₹${Math.round(n).toLocaleString('en-IN')}` : '—';
    const table = subscriptionTable(ipo);
    // Category key → SubRowT.req1x (retail → 'retail', sHNI → 'hni2', bHNI → 'hni')
    const req = (k: string) => table?.rows.find((r) => r.key === k)?.req1x ?? 0;
    const reserved: Record<string, number> = {
      Individual: req('retail'),
      sHNI: req('hni2'),
      bHNI: req('hni'),
    };
    return (
      <section className="subv2-det-panel pnl-lot">
        <header>
          <span className="pnl-ico"><Icon name="chart-fill" size={15} /></span>
          <div className="pnl-ttl">
            <h4>Lot ladder</h4>
            <span className="muted">SME</span>
          </div>
        </header>
        <div className="subv2-tbl-wrap">
          <table className="subv2-tbl">
            <thead><tr><th>Category</th><th>Lot(s)</th><th>Qty</th><th>Amount</th><th>Reserved</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.cat}>
                  <td><b>{r.cat}</b></td>
                  <td>{r.lots}</td>
                  <td>{fmtIn(r.shares)}</td>
                  <td>{rupees(r.amount)}</td>
                  <td>{fmtIn(reserved[r.cat] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }
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
    <section className="subv2-det-panel pnl-lot">
      <header>
        <span className="pnl-ico"><Icon name="chart-fill" size={15} /></span>
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
      const appRows = appWiseRows(table?.rows ?? []);
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
                    return (
                      <tr key={r.key}>
                        <td><span className={`subv2-dot ${dotClassFor(r.key ?? '')}`} /><b>{r.cat}</b></td>
                        <td>{appReq1xText(r)}</td>
                        <td><b>{fmtIn(r.bidCount ?? 0)}</b></td>
                        <td className={appToneCls(r)}><b>{appTimesText(r)}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* The cards view's table ends the same way the panel's does. */}
            <p className="subv2-aw-total"><span>Total applications</span><b>{fmtIn(totalApps)}</b></p>
            {proRataNote(appRows) && (
              <p className="subv2-aw-note">{proRataNote(appRows)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Off-screen 1080-wide snapshot card, rendered on demand while sharing.
 *
 *  THE IMAGE IS THE PAGE, AND UNTIL 2026-10-22 IT WAS NOT. Six operator
 *  reports in one message, and the root cause of three of them was that
 *  NEITHER FONT THIS CARD ASKED FOR EXISTED ON THE PAGE IT RENDERS ON:
 *  `next/font` publishes Inter as `__Inter_<hash>` (reachable only through
 *  `var(--font-sans)`), and 'JetBrains Mono' is loaded by `/partner-api`
 *  alone — a different route chunk. So every figure in both tables fell
 *  through to generic `monospace`, i.e. COURIER NEW on Windows, and the text
 *  to `system-ui`; the typeface also changed with whoever pressed Share.
 *  Verified in the published CSS: 42 `@font-face` blocks for `__Inter_*` /
 *  `__Plus_Jakarta_Sans_*`, 19 for `__JetBrains_Mono_*`, and ZERO declaring
 *  either literal name.
 *
 *  SO THE FAMILY IS RESOLVED AT SNAPSHOT TIME FROM THE LIVE DOM rather than
 *  named in CSS — `getComputedStyle(document.body).fontFamily` is by
 *  definition the face the page is painting, hash and all. It is set inline on
 *  the root and INHERITED; the canvas CSS must therefore declare no
 *  `font-family` at all, or a rule on `td` would beat the inheritance and put
 *  Courier back. Column alignment comes from `tabular-nums`, which is what the
 *  page's own tables use, not from a monospace face.
 *
 *  WIDTH IS THE ONLY THING THAT COSTS LEGIBILITY. The card is a fixed 1080px
 *  and a chat fits an image TO WIDTH, so a forwarded copy is read at roughly
 *  37%: a 26px figure arrives at ~10px. Extra ROWS are therefore free and
 *  extra COLUMNS are not — which is how "add the share counts back" (operator,
 *  2026-10-22) and "make the type bigger" are both satisfied at once. The
 *  share count went back in as a SECOND LINE inside the existing cell, exactly
 *  as `ShareWisePanel` renders it, adding no column.
 *
 *  Colours are inlined here rather than taken from `var()` so the image is
 *  identical whatever theme the reader's browser is in.
 */
function ShareCanvas({ ipo, onRef, disclaimer = 'full' }: {
  ipo: IpoFull;
  onRef: (el: HTMLDivElement | null) => void;
  /** 'full' prints the operator's locked wording verbatim; 'short' prints its
   *  operative sentence and points at the page. See SubscriptionDisclaimer —
   *  that text is sign-off-locked, so this switch chooses how much of it
   *  travels, never what it says. */
  disclaimer?: 'full' | 'short';
}) {
  const localRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    onRef(localRef.current);
    return () => onRef(null);
  }, [onRef]);

  /* The page's own face, read off the page. `document.body` carries
     `var(--font-sans)`, and the page's tables inherit it — they set no family
     of their own — so one value here reproduces every surface this card
     mirrors. `--font-display` is read for the headings and falls back to the
     body face rather than to a literal name that may not be declared. */
  const fonts = useMemo(() => {
    if (typeof document === 'undefined') return { sans: '', display: '' };
    const sans = getComputedStyle(document.body).fontFamily || '';
    const dsp = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim();
    return { sans, display: dsp || sans };
  }, []);

  const table = subscriptionTable(ipo);
  const t = table?.total.times ?? ipo.subscriptionTimes ?? 0;
  const tc = tone(t);
  const price = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
  const anchorDeducted = table?.anchorDeducted ?? 0;
  const anchorBasis = table?.anchorBasis ?? null;
  const toneHex = (x: number) => {
    const k = tone(x);
    return k === 'hot' ? '#0f9d58' : k === 'warm' ? '#e6ad12' : k === 'cool' ? '#c58a00' : '#d92d20';
  };
  const tHex = toneHex(t);
  const tBg = tc === 'hot' ? '#e6f6ee' : tc === 'warm' ? '#fff7df' : tc === 'cool' ? '#fff5d9' : '#fdece9';

  /* THE EXCHANGE'S OWN AS-OF TIME, which is the figure's age and the thing the
     page prints. This footer used to carry `new Date()` — when the IMAGE was
     made — so a snapshot taken at 18:00 of figures last polled at 13:52
     claimed 18:00 (operator report 4). Both are shown now, each labelled for
     what it is; only one of them says anything about the numbers. */
  const asOf = fmtDateTime((ipo as any).subscriptionAsOf);
  const generatedAt = fmtDateTime(new Date().toISOString());

  /* `issueSizeCr` FIRST, because `issueSize` is not a number on every payload:
     the /ipos LIST endpoint serves it ALREADY FORMATTED ("₹30,213 Cr") while
     the column is rupees. Reading it blind is the 10^7 error this repository
     has booked twice, most recently as a dash on the featured panel. */
  const issueSizeText = (() => {
    const cr = (ipo as any).issueSizeCr;
    if (typeof cr === 'number' && cr > 0) return fmtCr(cr);
    const raw = (ipo as any).issueSize;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (typeof raw === 'number' && raw > 0) return fmtCr(raw / 1e7);
    return '';
  })();

  const dates = fmtDateRange(ipo.openDate, ipo.closeDate);
  const band = ipo.priceBandMin && ipo.priceBandMax
    ? `₹${fmtIn(ipo.priceBandMin)} – ₹${fmtIn(ipo.priceBandMax)}`
    : (ipo.priceBandMax ?? ipo.priceBandMin) ? `₹${fmtIn((ipo.priceBandMax ?? ipo.priceBandMin) as number)}` : '';
  /* The four the operator picked (2026-10-22): the three the subscription card
     already shows as pills, plus the issue size. A detail with no value is
     dropped rather than printed as a dash — an image is not a form. */
  const facts: Array<[string, string]> = [
    ['IPO Dates', dates],
    ['Price Band', band],
    ['Lot Size', ipo.lotSize ? `${fmtIn(ipo.lotSize)} shares` : ''],
    ['Issue Size', issueSizeText],
  ].filter((f): f is [string, string] => Boolean(f[1]));

  /* The page's vocabulary, from the page's own resolver — status wording has to
     be identical across surfaces. Only the COLOUR is re-derived here, because
     `statusChip`'s class is a `var()`-driven tone family and this card inlines
     every colour it paints. */
  const status = statusChip(ipo);
  const stHot = /closing/i.test(status.label);

  const appRows = appWiseRows(table?.rows ?? []);

  /* Identical expression to `ShareWisePanel`'s `cell`, deliberately: shares as
     the headline with the row's own rupee value beneath it. `amount` is already
     valued at the row's OWN price, so a discounted employee quota reads the
     same here as on the page instead of at the band price. */
  const cell2 = (shares: number, amount?: number, rowPrice?: number) => {
    const px = rowPrice && rowPrice > 0 ? rowPrice : price;
    const cr = amount != null ? amount / 1e7 : px > 0 ? (shares * px) / 1e7 : null;
    return (
      <div className="sc-2l">
        <span className="big">{fmtIn(shares)}</span>
        {cr != null && <span className="small">{fmtCr(cr)}</span>}
      </div>
    );
  };

  const logo = (ipo as any).logo as string | undefined;
  const monogram = shortName(titleCase(ipo.name)).replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'IY';

  return (
    <div ref={localRef} className="subv2-canvas" aria-hidden="true" style={{ fontFamily: fonts.sans }}>
      {/* Brand band — the indigo ground is what `investoyard-logo-light.svg`
          exists for (our shipped mark is indigo + gold, and the indigo half of
          it disappears on an indigo field). This replaces the plain text
          "Investoyard" that used to sit here at 22px, i.e. SMALLER than the
          table figures beneath it (operator report 6). */}
      <div className="sc-band">
        <img className="sc-mark" src="/investoyard-logo-light.svg" alt="Investoyard" />
        <span className="sc-kicker">Live IPO Subscription</span>
      </div>

      <div className="sc-inner">
        <div className="sc-hero-row">
          <div className="sc-hero">
            {/* The company's own logo (operator ask, 2026-10-22). 102 of the
                1,306 records carry one and both issues open today do; the rest
                get a monogram rather than the generic building glyph, which
                reads as a missing image once rasterised. Capped at 80px
                because the sources are small — JPL's is a 148px PNG, so at
                `scale: 2` an 80px slot is 160 device px and barely upscaled,
                where a 120px slot would visibly soften it. */}
            <span className="sc-colog">
              {logo ? <img src={logo} alt="" crossOrigin="anonymous" /> : <span className="mono">{monogram}</span>}
            </span>
            <div className="sc-hero-t">
              <h1 className="sc-name">{shortName(titleCase(ipo.name))}</h1>
              <div className="sc-chips">
                <span className={`sc-tag ${ipo.type === 'sme' ? 'sme' : 'mb'}`}>{ipo.type === 'sme' ? 'SME IPO' : 'Mainboard IPO'}</span>
                <span className="sc-st" style={{ color: stHot ? '#d92d20' : '#0f9d58', background: stHot ? '#fdece9' : '#e6f6ee' }}>{status.label}</span>
              </div>
            </div>
          </div>
          <div className="sc-hero-r">
            <div className="sc-times" style={{ color: tHex }}>
              <span className="n">{t.toFixed(2)}</span><span className="x">×</span>
            </div>
            <div className="sc-status" style={{ color: tHex, background: tBg }}>{toneLabel(t)}</div>
          </div>
        </div>

        {/* As-of, on its own line and not in the footer: it is the age of every
            figure below it, so it belongs with them. */}
        {asOf && <div className="sc-asof">Exchange data as of <b>{asOf}</b></div>}

        {facts.length > 0 && (
          <div className="sc-facts">
            {facts.map(([k, v]) => (
              <div className="sc-fact" key={k}>
                <span className="k">{k}</span>
                <span className="v">{v}</span>
              </div>
            ))}
          </div>
        )}

        {table && (
          <section className="sc-section">
            <h3 style={{ fontFamily: fonts.display }}>Share-wise Subscription</h3>
            <table className="sc-tbl">
              {/* The page's headers, in the page's words. These had drifted to
                  "Book size" and "Times" against the panel's "Book Size" and
                  "No. of Times" — small, but it is why a shared image did not
                  read as the page it came from. */}
              <thead><tr><th>Category</th><th>Book Size</th><th>Subscription</th><th>No. of Times</th></tr></thead>
              <tbody>
                {table.rows.slice().sort((a, b) => (SHARE_ORDER[a.key ?? ''] ?? 99) - (SHARE_ORDER[b.key ?? ''] ?? 99)).map((r) => {
                  /* The page's labels too: `nii` is the API's synthetic
                     combined bucket and reads as plain "HNI", and QIB says
                     "(Ex. Anchor)" ONLY where a deduction was applied — on a
                     record with no anchor figure the book IS gross and the
                     label would lie. Without this the shared image showed a
                     QIB book short by the anchor with nothing explaining it. */
                  const isCombo = r.key === 'nii';
                  const isSubcat = r.key === 'hni' || r.key === 'hni2';
                  const exAnchor = r.key === 'qib' && anchorDeducted > 0;
                  const label = isCombo ? 'HNI' : exAnchor ? 'QIB (Ex. Anchor)' : r.cat;
                  return (
                    <tr key={r.key} className={isSubcat ? 'sc-sub' : undefined}>
                      <td><span className={`sc-cat-dot ${isCombo ? 'hni' : dotClassFor(r.key ?? '')}`} />{label}</td>
                      <td>{cell2(r.bookSize, r.bookAmount, r.price)}</td>
                      <td>{cell2(r.subscribed, r.subAmount, r.price)}</td>
                      <td className="sc-mult" style={{ color: toneHex(r.times) }}>{r.times.toFixed(2)}×</td>
                    </tr>
                  );
                })}
                <tr className="sc-tot">
                  <td>Total</td>
                  <td>{cell2(table.total.bookSize, table.total.bookAmount)}</td>
                  <td>{cell2(table.total.subscribed, table.total.subAmount)}</td>
                  <td className="sc-mult">{t.toFixed(2)}×</td>
                </tr>
              </tbody>
            </table>
            {/* The page's anchor footnote, verbatim from ShareWisePanel. It
                costs no arithmetic — `subscriptionTable` has returned
                `anchorDeducted` and `anchorBasis` since 2026-09-21 — and one
                figure can be checked against the exchange while the other
                cannot, so it says which. */}
            <p className="sc-foot-note">
              {anchorDeducted <= 0
                ? '*QIB Book Size is Gross — the anchor allocation is not on this record yet.'
                : anchorBasis === 'estimated'
                  ? `*QIB Book Size EXCLUDES the anchor portion of ${fmtIn(anchorDeducted)} shares, which is ESTIMATED from the reserved percentage rather than the allotment.`
                  : `*QIB Book Size EXCLUDES the anchor portion of ${fmtIn(anchorDeducted)} shares, from the actual anchor allotment.`}
            </p>
          </section>
        )}

        {appRows.length > 0 && (
          <section className="sc-section">
            <h3 style={{ fontFamily: fonts.display }}>Application-wise Subscription</h3>
            <table className="sc-tbl">
              <thead><tr><th>Category</th><th>Req 1×</th><th>Applications</th><th>Times</th></tr></thead>
              <tbody>
                {appRows.map((r) => (
                  <tr key={r.key}>
                    <td><span className={`sc-cat-dot ${dotClassFor(r.key ?? '')}`} />{r.cat}</td>
                    <td className="sc-num">{appReq1xText(r)}</td>
                    <td className="sc-num b">{fmtIn(r.bidCount ?? 0)}</td>
                    <td className="sc-mult" style={{ color: r.proRata ? '#6b7280' : toneHex(r.applicationsTimes ?? 0) }}>{appTimesText(r)}</td>
                  </tr>
                ))}
                <tr className="sc-tot">
                  <td>Total Applications</td>
                  <td />
                  <td className="sc-num">{fmtIn(appRows.reduce((n, r) => n + (r.bidCount ?? 0), 0))}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {/* THE DISCLAIMER TRAVELS WITH THE IMAGE, because a forwarded snapshot
            leaves the page and its caveat behind. The wording is the operator's
            own, locked 2026-09-18 — see SubscriptionDisclaimer, which is where
            both surfaces read it from; nothing here rewords it.
            It also used to be unreadable rather than absent: `.sc-disclaimer`
            was declared ONCE, UNSCOPED, at 15px among the showcase rules, so it
            rendered at a third the size of the figures and about 5px once
            forwarded. It is scoped under `.subv2-canvas` now. */}
        <section className="sc-disclaimer">
          <h4>Disclaimer</h4>
          <p className="lead">
            Sourced from the websites of the National Stock Exchange (NSE) and Bombay
            Stock Exchange (BSE) and subject to change on real time basis. For information
            purpose only &mdash; the recipient alone is responsible for any decision taken
            on the basis of this data.
          </p>
          {disclaimer === 'full' ? (
            <p className="fine">
              The above-mentioned information / data are sourced from the websites of
              National Stock Exchange (NSE) and Bombay Stock Exchange (BSE) and are subject
              to change on real time basis. For updated information / data you can visit
              their respective website. The information / data provided herein above are
              for information purpose only and provided &ldquo;AS IS&rdquo; and &ldquo;AS
              AVAILABLE&rdquo; basis and without warranty, express or implied. We do not
              guarantee or warrant the accuracy, adequacy or completeness of the
              information received through the said websites. &ldquo;We&rdquo; hold not
              responsibility of any kind as regard to any discrepancies, errors,
              omissions, losses or damages. &ldquo;We&rdquo; including its affiliates and
              any of its officers, directors, personnel and employees, shall not liable
              for any loss, damage of any nature, including but not limited to direct,
              indirect, punitive, special, exemplary, consequential, as also any loss of
              profit in any way arising from the use of information / data received
              through the said websites. The recipient alone shall be fully responsible /
              are liable for any decision taken on the basis of such information / data.
              All recipients should before acting upon the said information make their own
              investigation, seek appropriate professional advice.
            </p>
          ) : (
            <p className="fine">
              Provided &ldquo;AS IS&rdquo; and without warranty, express or implied. We do
              not guarantee the accuracy, adequacy or completeness of the information.
              Full disclaimer at investoyard.com/subscription.
            </p>
          )}
        </section>

        <footer className="sc-foot">
          <span className="sc-url">investoyard.com</span>
          <span className="sc-time">Snapshot generated {generatedAt}</span>
        </footer>
      </div>
    </div>
  );
}

// Silence the eslint no-unused about subCatLabel (imported so the module barrel
// stays intact if the panel later opts into rich labels for legacy rows).
void subCatLabel;

/** Warm an image into the cache and wait for it to load, so html2canvas
 *  finds it ready. NEVER rejects and never waits long: a logo is decoration
 *  and a share must not fail — or hang — over one. */
function preloadImage(src: string, crossOrigin?: string, ms = 2500): Promise<void> {
  return new Promise<void>((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    const timer = window.setTimeout(resolve, ms);
    const fin = () => { window.clearTimeout(timer); resolve(); };
    img.onload = fin;
    img.onerror = fin;
    img.src = src;
  });
}

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
