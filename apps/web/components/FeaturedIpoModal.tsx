'use client';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ipoUrl, titleCase, LABEL, lotLadder } from '@investoyard/shared-types';
import { Icon } from '@/components/Icon';
import { getIpoDetail } from '@/lib/api';

/**
 * A one-issue welcome panel on the home page, for the rare IPO big enough to be
 * the reason someone opened the site.
 *
 * DATA-DRIVEN SO IT CANNOT GO STALE. Only the symbol and the headline below are
 * authored; the logo, band, lot, minimum, size and dates all come from the live
 * record, and the panel REMOVES ITSELF once the issue's close date has passed.
 * A promotional popup for an IPO that shut last week is worse than no popup, and
 * nobody remembers to take one down.
 *
 * LANDSCAPE, NOT PORTRAIT (operator's call, 17 Oct). A tall panel on a laptop
 * pushed the CTA toward the fold and made the one number that JUSTIFIES the
 * headline compete with five data rows for the same column. Split in two, the
 * left half is a STAGE — the claim and its proof — and the right half is the
 * BOARD — when it opens, what it costs, and the way in. It collapses to one
 * column under 820px, because a phone has no landscape to give.
 *
 * THE CLAIM IS PROVED, NOT ASSERTED. "Sabse bada" is backed by the issue size
 * set in the largest type on the panel, and the chip under it states the basis
 * — largest in OUR catalogue, which is what we can actually stand behind. The
 * runner-up is deliberately NOT NAMED: our stored Paytm figure (28,300) has no
 * legs to corroborate it and disagrees with that issue as published, and a
 * comparison is only worth printing when BOTH sides of it are sound. The
 * superlative holds either way — JPL is above both readings — so naming second
 * place would have risked a wrong number to add nothing.
 *
 * THE COUNTDOWN REPLACED THREE WAYS OF SAYING ONE THING. An earlier cut carried
 * an "Opens in 4 days" chip AND an Opens tile AND a Closes tile — the same fact
 * three times, which is most of why the panel read flat. One ticking clock to
 * the opening bell says it once and gives the right column a focal point of its
 * own. It anchors on 10:00 exactly as `OpensIn` in IpoCard already does, so the
 * hour is the codebase's existing convention and not precision invented here.
 *
 * THE CTA READS THE SAME GATE EVERY OTHER SURFACE READS — `extra.startBid` for
 * apply, `extra.startPrint` for forms, exactly as IpoCard does. The admin form's
 * own hint for that toggle says "OFF -> Apply hidden on site & app", so a popup
 * that offered Apply regardless would be the one place on the site promising
 * something the next screen refuses. With the gate off it offers the detail page
 * instead; flip Start Bid and the same panel starts offering Apply, with nothing
 * to edit here.
 *
 * ALWAYS ON LOAD (operator's call, 17 Oct). It opened once a day per browser
 * first, which is the kinder default for an ordinary promotion — but this runs
 * for a handful of days around one issue, and a partner demonstrating the site
 * on a stand needs it every time. The dismissal is still RECORDED, so turning
 * the once-a-day rule back on is one line and loses no history.
 *
 * IT OPENS ON MOUNT, with no timer. A delay was the first cut and it was
 * wrong: for the one issue big enough to earn a panel, the panel IS why the
 * page was opened, and a visitor who scrolls within the delay never sees it.
 *
 * IT DOES NOT REUSE .modal-overlay / .modal, deliberately. Those are paired
 * with .admin-shell in globals.css and REDEFINE --surface, --text and --border
 * to the admin palette — and flip to the admin DARK palette under
 * html[data-admin-theme="dark"]. On a public page that is a consumer popup
 * wearing the admin theme, dark for anyone who ever set it. Own prefix, own
 * colours, stated outright.
 */

/** The issue to feature. Empty string disables the panel entirely. */
const FEATURED_SYMBOL = 'JPL';

/**
 * The one authored line, SPLIT SO THE SECOND HALF CAN CARRY THE GOLD. Two
 * tones on two lines is the team's design; keeping it as one string and
 * breaking it in CSS would leave the break at the mercy of the font metrics.
 */
const HEADLINE_TOP = 'India ka';
const HEADLINE_GOLD = 'Sabse Bada IPO';
const HEADLINE = HEADLINE_TOP + ' ' + HEADLINE_GOLD;   // the accessible name

/** Our own strapline on the panel. */
const STRAPLINE = 'Your IPO Partner';

/**
 * An optional artwork for the top of the stage, as a path under /public.
 *
 * EMPTY MEANS THE BRAND TREATMENT, and that is the honest default rather than
 * a placeholder: with no file here the stage shows the issue's OWN logo on the
 * gradient, which is a mark we are given with the record. Point this at a
 * supplied file and the same panel renders it with a slow drift; there is
 * nothing else to change.
 */
const HERO_IMAGE = '/featured/jpl-stage.png';

const DISMISS_KEY = `iy.featured.${FEATURED_SYMBOL}`;

/** The hours an issue opens and closes on, matching `OpensIn` in IpoCard. */
const OPEN_AT = 'T10:00:00';
const CLOSE_AT = 'T17:00:00';


type AnyIpo = Record<string, any>;

const reduced = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * A single launch burst behind the logo when the panel opens — streaks on a
 * radial spread, a flash and two expanding rings.
 *
 * IT FIRES ONCE AND STOPS. A looping firework would be exhausting on a page
 * someone is trying to read a price band off, and it is the issue OPENING that
 * is being marked, not a prediction about it: a celebration that never ends
 * starts to read as a promise. The ambient layers behind it — the aurora and
 * the embers — are deliberately slow and dim for the same reason: atmosphere,
 * not applause.
 *
 * Pure CSS, no library and no canvas — and every particle's resting state is
 * `opacity: 0`, so when the global prefers-reduced-motion rule strips the
 * animation (and with it the fill-mode) they are simply invisible rather than
 * a clump of dots parked behind the logo.
 */
const SPARKS = Array.from({ length: 24 }, (_, i) => {
  const wave = i < 14 ? 0 : 1;            // a second, wider wave reads as a real burst
  const n = wave === 0 ? 14 : 10;
  const k = wave === 0 ? i : i - 14;
  return {
    a: (360 / n) * k + (k % 2 ? 9 : -9),  // offset alternate arms so it is not a clock face
    d: (wave === 0 ? 74 : 112) + (k % 3) * 26,
    delay: (wave === 0 ? 0.18 : 0.34) + (k % 5) * 0.03,
    // streaks read as a firework; squares alone read as confetti
    kind: i % 4 === 0 ? 'w' : i % 3 === 0 ? 'o' : '',
  };
});

function Burst() {
  return (
    <span className="fi-burst" aria-hidden="true">
      <span className="fi-flash" />
      <span className="fi-ring" />
      <span className="fi-ring two" />
      {SPARKS.map((s, i) => (
        <i
          key={i}
          className={`fi-spark${s.kind ? ` ${s.kind}` : ''}`}
          style={{ '--a': `${s.a}deg`, '--d': `${s.d}px`, animationDelay: `${s.delay}s` } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

/**
 * Embers drifting up the stage, behind everything.
 *
 * DETERMINISTIC, NOT RANDOM. `Math.random()` here would differ between the
 * server render and the client one, which React reports as a hydration
 * mismatch — every value below is a function of the index. The negative delays
 * mean the drift is already underway when the panel opens, so it reads as
 * atmosphere that was always there rather than an effect that just started.
 */
const EMBERS = Array.from({ length: 18 }, (_, i) => ({
  x: (i * 37) % 100,                      // a stride coprime with 100 spreads them without clumping
  dur: 9 + (i % 5) * 2.4,
  delay: -((i * 1.37) % 11),
  size: i % 3 === 0 ? 3 : 2,
  drift: (i % 2 ? 1 : -1) * (8 + (i % 4) * 7),
}));

/**
 * The ribbon curves behind the stage.
 *
 * SVG, NOT FOUR DIVS WITH border-radius. The shapes are long sweeping arcs
 * that run off every edge, which a rounded box cannot describe — and one path
 * each means the whole layer scales with the panel instead of needing a
 * breakpoint. preserveAspectRatio slice lets it crop rather than squash when
 * the stage is short and wide.
 *
 * It drifts on a long cycle, far slower than anything the eye tracks; the
 * aurora behind it moves the other way, which is what gives the half depth.
 */
function Swoosh() {
  return (
    <svg className="fi-swoosh" viewBox="0 0 400 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="M-60 150 C 90 70, 150 250, 90 400 C 40 530, 120 600, 230 680" />
      <path d="M-40 250 C 120 180, 190 330, 140 470 C 100 580, 180 640, 290 700" className="two" />
      <path d="M330 -40 C 420 120, 360 250, 250 330 C 150 400, 170 520, 300 580" className="three" />
      <path d="M-70 560 C 60 520, 140 560, 220 640" className="gold" />
      <path d="M-70 600 C 70 555, 160 600, 250 690" className="gold thin" />
    </svg>
  );
}
function Embers() {
  return (
    <span className="fi-embers" aria-hidden="true">
      {EMBERS.map((e, i) => (
        <i
          key={i}
          style={{
            left: `${e.x}%`, width: e.size, height: e.size,
            animationDuration: `${e.dur}s`, animationDelay: `${e.delay}s`,
            '--dx': `${e.drift}px`,
          } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

/**
 * The issue size, counted up once when the panel opens.
 *
 * IT RENDERS THE TRUE FIGURE FIRST and the ramp only ever overwrites it
 * transiently: state starts at the final number, so a browser that never runs
 * the effect, one reporting prefers-reduced-motion, and a frame dropped
 * mid-ramp all leave the correct figure on screen. Every other animation here
 * is decoration; this one draws a NUMBER, and a count-up that can strand a
 * wrong one would be the single thing on this panel that lies.
 *
 * useLayoutEffect, not useEffect — the reset to zero has to land before the
 * browser paints, or the figure visibly flickers from final to zero and back.
 *
 * IT WAITS OUT THE REVEAL. .fi-amt carries an entry delay, so a ramp started on
 * mount would spend most of itself behind opacity 0 and the figure would appear
 * already nearly counted. Held back, it starts as the element arrives.
 */
function CountUp({ to, ms = 950, delay = 300 }: { to: number; ms?: number; delay?: number }) {
  const [n, setN] = useState(to);
  useLayoutEffect(() => {
    if (reduced()) return;
    let raf = 0;
    const t0 = performance.now();
    setN(0);
    const step = (t: number) => {
      const p = Math.min(1, Math.max(0, t - t0 - delay) / ms);
      // ease-out: quick off the mark, settling onto the figure rather than
      // racing past it and snapping back
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step); else setN(to);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms, delay]);
  return <>{n.toLocaleString('en-IN')}</>;
}

/**
 * The issue size, in CRORE.
 *
 * THE FIELD CALLED `issueSize` IS NOT A NUMBER ON THIS SURFACE. The /ipos list
 * endpoint serves it ALREADY FORMATTED — "₹30,213 Cr" — so Number() is NaN on
 * all 1,304 records and a naive read renders a dash under the label. (The
 * COLUMN behind it is rupees, which is what every note about it describes;
 * what reaches the browser is not the column.) `issueSizeCr` is the number.
 *
 * Resolved in that order, with the formatted string parsed only as a last
 * resort and CARRYING ITS OWN UNIT: a value with Cr on it is crore, a bare
 * numeric string is the rupee column. Getting that backwards is a 10^7 error.
 */
const croreOf = (ipo: AnyIpo): number | null => {
  const cr = Number(ipo?.issueSizeCr ?? ipo?.extra?.issueSizeCr);
  if (Number.isFinite(cr) && cr > 0) return Math.round(cr);
  const raw = ipo?.issueSize;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.round(raw / 1e7);
  if (typeof raw === 'string') {
    const n = Number(raw.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    return /cr/i.test(raw) ? Math.round(n) : Math.round(n / 1e7);
  }
  return null;
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
type Ymd = { y: number; m: number; d: number; iso: string };
const parts = (s?: string | null): Ymd | null => {
  const d = String(s ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? { y: +d.slice(0, 4), m: +d.slice(5, 7) - 1, d: +d.slice(8, 10), iso: d }
    : null;
};

/**
 * The bidding window on one line — the year once, the month once when both ends
 * share it. Mirrors `fmtRange` in IpoCard so the two surfaces word a window the
 * same way; that one is local to its file, and four lines here beats exporting
 * a formatter this panel would be the only other caller of.
 */
function windowLine(open?: string | null, close?: string | null): string | null {
  const a = parts(open), b = parts(close);
  const one = (x: Ymd) => `${x.d} ${MON[x.m]} ${x.y}`;
  if (!a && !b) return null;
  if (!a || !b) return one((a ?? b) as Ymd);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MON[b.m]} ${b.y}`;
  return `${a.d} ${MON[a.m]} – ${b.d} ${MON[b.m]} ${b.y}`;
}

/**
 * The clock on the board.
 *
 * CLIENT-ONLY BY CONSTRUCTION — it renders nothing until the first effect has
 * run, because a time rendered on the server is already wrong by the moment it
 * reaches anyone, and React reports the difference as a hydration mismatch.
 * The same reason `OpensIn` in IpoCard holds its `now` in state.
 *
 * It counts to the OPEN while the issue is upcoming and to the CLOSE once it is
 * live, on the 10:00 / 17:00 anchors the rest of the codebase uses. Past the
 * close it renders NOTHING rather than counting into the negative — and the
 * panel has removed itself by then anyway.
 */
function Countdown({ openIso, closeIso }: { openIso?: string | null; closeIso?: string | null }) {
  const a = parts(openIso), b = parts(closeIso);
  const aIso = a?.iso ?? null, bIso = b?.iso ?? null;
  const target = useMemo(() => ({
    open: aIso ? new Date(aIso + OPEN_AT).getTime() : null,
    close: bIso ? new Date(bIso + CLOSE_AT).getTime() : null,
  }), [aIso, bIso]);

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;

  const { open, close } = target;
  const upcoming = open !== null && now < open;
  const to = upcoming ? open : close;
  if (to === null) return null;
  const diff = to - now;
  if (diff <= 0) return null;

  const cells = [
    { n: Math.floor(diff / 86400000), k: 'Days' },
    { n: Math.floor(diff / 3600000) % 24, k: 'Hrs' },
    { n: Math.floor(diff / 60000) % 60, k: 'Min' },
    { n: Math.floor(diff / 1000) % 60, k: 'Sec' },
  ];

  return (
    <div className="fi-cd">
      <div className="fi-cd-k">
        <span className="fi-cd-dot" aria-hidden="true" />
        {upcoming ? 'Bidding opens in' : 'Bidding closes in'}
      </div>
      <div className="fi-cd-row">
        {cells.map((c, i) => (
          <div className="fi-cd-cell" key={c.k}>
            <span className="fi-cd-n">{i === 0 ? c.n : String(c.n).padStart(2, '0')}</span>
            <span className="fi-cd-u">{c.k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type Band = { cat: string; sub: string; lots: string; shares: string; amount: string };

/**
 * The lot ladder — what a bid COSTS in each category.
 *
 * IT REPLACED THE "Lot Size" AND "Min Application" TILES and carries both of
 * them: the lot size IS the first row's share count and the minimum
 * application IS its amount. Nothing was lost and the two bands above retail
 * were gained — which is the question a reader with ₹5 lakh actually has.
 *
 * `lotLadder()` returns a MIN and a MAX row per category on a mainboard issue
 * and ONE row per category on SME. Collapsed here to a single row each with a
 * range, because five rows is a table and three is a glance — and this column
 * is ~430px, not a page. The shared helper is not re-implemented: the
 * collapsing is presentation, the arithmetic stays where its tests are.
 *
 * The top band is OPEN-ENDED and says so with a "+". That is read from the
 * band's own label rather than from its position, so an issue whose ladder
 * ends differently cannot be given a ceiling it does not have.
 */
function ladderBands(ipo: AnyIpo): Band[] {
  let rows: { cat: string; sub: string; lots: number; shares: number; amount: number }[] = [];
  // a malformed record must not take the home page down with it
  try { rows = lotLadder(ipo as any) ?? []; } catch { return []; }
  const by = new Map<string, { cat: string; sub: string; lo: typeof rows[0]; hi: typeof rows[0] }>();
  for (const r of rows) {
    const g = by.get(r.cat);
    if (!g) by.set(r.cat, { cat: r.cat, sub: r.sub, lo: r, hi: r });
    else { if (r.lots < g.lo.lots) g.lo = r; if (r.lots > g.hi.lots) g.hi = r; }
  }
  const n = (v: number) => v.toLocaleString("en-IN");
  return [...by.values()].map((g) => {
    const open = /^above/i.test(g.sub);
    const span = (a: number, b: number) => (open ? n(a) + "+" : a === b ? n(a) : n(a) + " – " + n(b));
    return {
      cat: g.cat,
      sub: g.sub,
      lots: span(g.lo.lots, g.hi.lots),
      shares: span(g.lo.shares, g.hi.shares),
      amount: open ? "₹" + n(g.lo.amount) + "+"
        : g.lo.amount === g.hi.amount ? "₹" + n(g.lo.amount)
        : "₹" + n(g.lo.amount) + " – ₹" + n(g.hi.amount),
    };
  });
}
/**
 * The four short facts about WHAT KIND OF ISSUE this is, as chips.
 *
 * Every one is DERIVED, never authored, and an absent one is simply not
 * pushed — the row shortens rather than carrying a chip that says nothing.
 *
 * "100% Fresh issue" is the one worth having: it means no promoter is
 * selling down and every rupee raised reaches the company, which is a real
 * difference to an applicant and is sitting unused in the record. It is
 * claimed ONLY when there is a fresh leg AND the OFS leg is explicitly zero
 * — a missing OFS leg is an unanswered question, not a zero.
 */
function issueChips(ipo: AnyIpo, ex: AnyIpo): string[] {
  const out: string[] = [];
  const kind = String(ex.categoryName ?? ipo.type ?? "").trim();
  if (kind) out.push(kind.toLowerCase() === "mainboard" ? "Mainboard" : titleCase(kind));
  const mech = String(ex.mechanism ?? "").trim();
  if (mech) out.push(mech === "book_built" ? "Book built" : mech === "fixed_price" ? "Fixed price" : titleCase(mech.replace(/_/g, " ")));
  const ex2 = Array.isArray(ipo.exchanges) ? ipo.exchanges.filter(Boolean) : [];
  if (ex2.length) out.push(ex2.join(" + "));
  const fresh = Number(ex.fresh?.value), ofs = Number(ex.ofs?.value);
  if (Number.isFinite(fresh) && fresh > 0 && Number.isFinite(ofs) && ofs === 0) out.push("100% Fresh issue");
  return out;
}

/**
 * The dates an applicant actually asks about, in order.
 *
 * THE STEP STATES ARE DERIVED FROM TODAY, so the strip cannot describe a
 * stage the issue has left. A step whose day has passed is "done"; the first
 * that has not is "next" and takes the accent; the rest are plain. Nothing
 * here is authored, and a date we do not hold is dropped rather than dashed.
 */
function keyDates(ipo: AnyIpo, ex: AnyIpo): { k: string; d: string; iso: string }[] {
  const rows: { k: string; d: string; iso: string }[] = [];
  const push = (k: string, raw?: string | null) => {
    const t = parts(raw);
    if (t) rows.push({ k, d: t.d + " " + MON[t.m], iso: t.iso });
  };
  push("Anchor", ex.anchorDate);
  push("Opens", ipo.openDate);
  push("Closes", ipo.closeDate);
  push("Allotment", ipo.allotmentDate);
  push("Listing", ipo.listingDate);
  return rows;
}

/** Today as a local calendar day, so "done" means the reader's own days. */
const todayYmd = () => new Date().toLocaleDateString("en-CA");

function Timeline({ rows }: { rows: { k: string; d: string; iso: string }[] }) {
  const [today, setToday] = useState<string | null>(null);
  // client-only, for the same reason the countdown is: a state derived from
  // the clock differs between the server render and the client one.
  useEffect(() => { setToday(todayYmd()); }, []);
  if (!rows.length) return null;
  const nextIdx = today === null ? -1 : rows.findIndex((r) => r.iso >= today);
  return (
    <div className="fi-tl">
      <div className="fi-tl-k">Key dates</div>
      <ol className="fi-tl-row">
        {rows.map((r, i) => {
          const state = today === null ? "" : i < nextIdx || nextIdx === -1 ? " done" : i === nextIdx ? " next" : "";
          return (
            <li className={"fi-tl-step" + state} key={r.k}>
              <span className="fi-tl-dot" aria-hidden="true" />
              <span className="fi-tl-d">{r.d}</span>
              <span className="fi-tl-n">{r.k}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
export function FeaturedIpoModal({ ipos }: { ipos: AnyIpo[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // the LIVE record, once it arrives — see the note above on why the baked
  // one is not enough for the gates
  const [live, setLive] = useState<AnyIpo | null>(null);

  const baked = FEATURED_SYMBOL
    ? (ipos ?? []).find((i) => String(i?.symbol ?? '').toUpperCase() === FEATURED_SYMBOL)
    : undefined;
  // The live copy wins field by field; a failed fetch simply leaves the baked
  // record in place, which is what the panel showed before this.
  //
  // MEMOISED, and not for speed: the open effect below lists `ipo` as a
  // dependency, so a fresh object literal every render would re-run it every
  // render. It survives today only because both setState calls in it are
  // no-ops once settled, which is not a property to depend on.
  const ipo = useMemo(
    () => (baked ? { ...baked, ...(live ?? {}) } : undefined),
    [baked, live],
  );

  // Past its close date, the panel is gone — no edit, no deploy, no reminder.
  const closed = (() => {
    const c = ipo?.closeDate;
    if (!c) return false;
    const d = new Date(c);
    if (Number.isNaN(d.getTime())) return false;
    d.setHours(23, 59, 59, 999);
    return d.getTime() < Date.now();
  })();

  useEffect(() => {
    setMounted(true);
    if (!ipo || closed) return;
    let seen = '';
    // Storage throws in a private window and in some embedded views; a panel
    // that cannot remember is better than a page that cannot render.
    try { seen = window.localStorage.getItem(DISMISS_KEY) ?? ''; } catch { /* no-op */ }
    void seen; // kept: see ALWAYS ON LOAD above
    setOpen(true);
  }, [ipo, closed]);

  useEffect(() => {
    if (!open || !FEATURED_SYMBOL) return;
    let gone = false;
    getIpoDetail(FEATURED_SYMBOL)
      .then((d) => { if (!gone && d) setLive(d as AnyIpo); })
      .catch(() => { /* the baked record stands */ });
    return () => { gone = true; };
  }, [open]);

  const close = () => {
    setOpen(false);
    try { window.localStorage.setItem(DISMISS_KEY, new Date().toDateString()); } catch { /* no-op */ }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  if (!mounted || !open || !ipo) return null;

  const ex = (ipo.extra ?? {}) as AnyIpo;
  const canApply = ex.startBid === true;
  const lot = Number(ipo.lotSize) || 0;
  const cap = Number(ipo.priceBandMax) || 0;
  const floor = Number(ipo.priceBandMin) || 0;

  const band = floor && cap
    ? `₹${floor.toLocaleString('en-IN')} – ₹${cap.toLocaleString('en-IN')}`
    : floor ? `₹${floor.toLocaleString('en-IN')}` : null;

  // Two tiles, not four. The Opens and Closes tiles an earlier cut carried said
  // what the countdown and the window line above them already say. An empty
  // tile is DROPPED rather than dashed — a popup is not the place to advertise
  // a gap in our own data.
  const tiles: { k: string; v: string; icon: 'box' | 'rupee' }[] = [];
  if (lot) tiles.push({ k: LABEL.lotSize, v: `${lot.toLocaleString('en-IN')} shares`, icon: 'box' });
  if (lot && cap) tiles.push({ k: LABEL.minApplication, v: `₹${(lot * cap).toLocaleString('en-IN')}`, icon: 'rupee' });

  const chips = issueChips(ipo, ex);
  const bands = ladderBands(ipo);
  const dates = keyDates(ipo, ex);
  const registrar = String(ipo.registrar ?? "").trim();
  const faceValue = Number(ex.faceValue) || 0;
  const cr = croreOf(ipo);
  const name = titleCase(ipo.name) || ipo.symbol;
  const win = windowLine(ipo.openDate, ipo.closeDate);
  // the timeline carries Opens and Closes when it has them; the line below it
  // then says nothing a reader has not already read twice
  const hasWindowInTimeline = dates.some((d) => d.k === "Opens") && dates.some((d) => d.k === "Closes");

  return createPortal(
    <div className="fi-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="fi-panel" role="dialog" aria-modal="true" aria-labelledby="fi-title">
        <button type="button" className="fi-x" onClick={close} aria-label="Close">
          <Icon name="x" size={18} />
        </button>

        <div className="fi-split">
          <div className="fi-head">
            <span className="fi-aurora" aria-hidden="true" />
            <Swoosh />
            <Embers />

            {/* OUR mark, top-left, before the issue's. The panel is ours and the
                issue is the subject of it — a partner demonstrating this on a
                stand is showing Investoyard, not Jio. */}
            <div className="fi-brand">
              <img className="fi-brand-logo" src="/investoyard-logo-light.svg" alt="Investoyard" />
              <span className="fi-brand-sub">{STRAPLINE}</span>
            </div>

            {/* The stage artwork. With no supplied file this is the issue's OWN
                logo on the gradient — a mark that arrives with the record —
                rather than a placeholder standing in for one.
                The burst is anchored HERE, not to the panel edge, so the
                firework always goes off on the artwork however tall it is. */}
            <div className={`fi-hero${HERO_IMAGE ? ' has-art' : ''}`}>
              <span className="fi-glow" aria-hidden="true" />
              <span className="fi-mark">
                <Burst />
                {HERO_IMAGE
                  ? <img className="fi-art" src={HERO_IMAGE} alt="" />
                  : ipo.logoUrl
                    ? <img className="fi-logo" src={String(ipo.logoUrl)} alt="" />
                    : null}
              </span>
            </div>

            <h2 className="fi-big" id="fi-title" aria-label={HEADLINE}>
              <span className="fi-big-1" aria-hidden="true">{HEADLINE_TOP}</span>
              <span className="fi-big-2" aria-hidden="true"><span>{HEADLINE_GOLD}</span></span>
            </h2>
            <div className="fi-name">{name}</div>
            <span className="fi-rule" aria-hidden="true" />

            {/* No figure, no card. This is the PROOF of the headline above it,
                and a rupee sign over a dash reads as the panel being broken —
                worse than the claim standing on the medallion below on its own. */}
            {cr !== null && (
              <div className="fi-amt">
                <span className="fi-amt-k">{LABEL.issueSize}</span>
                <span className="fi-amt-v"><i>₹</i><CountUp to={cr} /><b>Cr</b></span>
              </div>
            )}

            <div className="fi-rank">
              <span className="fi-rank-n" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                  <path fill="currentColor" d="M3 7.5 6.6 10 12 3.8 17.4 10 21 7.5l-1.7 9.2a1 1 0 0 1-1 .8H5.7a1 1 0 0 1-1-.8L3 7.5Z" />
                  <rect x="4.6" y="18.6" width="14.8" height="2.1" rx="1.05" fill="currentColor" />
                </svg>
                #1
              </span>
              <span>Largest issue in our catalogue of 1,300+ Indian IPOs</span>
            </div>

            {chips.length > 0 && (
              <ul className="fi-chips">
                {chips.map((c) => <li key={c}>{c}</li>)}
              </ul>
            )}
          </div>

          <div className="fi-facts">
            <Countdown openIso={ipo.openDate} closeIso={ipo.closeDate} />

            {win && !hasWindowInTimeline && (
              <div className="fi-win">
                <Icon name="calendar" size={13} />
                Bidding window <b>{win}</b>
              </div>
            )}

            {band && (
              <div className="fi-band">
                <span className="fi-band-k">{LABEL.offerPrice}</span>
                <span className="fi-band-v">{band}</span>
              </div>
            )}

            {bands.length > 0 ? (
              <div className="fi-lad">
                <div className="fi-lad-k">{LABEL.lotDetails}</div>
                <table className="fi-lad-t">
                  <thead>
                    <tr><th>Category</th><th>Lots</th><th>Shares</th><th>Amount</th></tr>
                  </thead>
                  <tbody>
                    {bands.map((b) => (
                      <tr key={b.cat}>
                        <th scope="row"><b>{b.cat}</b><i>{b.sub}</i></th>
                        <td>{b.lots}</td>
                        <td>{b.shares}</td>
                        <td className="fi-lad-amt">{b.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* no band or no lot size — fall back to the two plain facts */
              <dl className="fi-grid">
                {tiles.map((t) => (
                  <div className="fi-tile" key={t.k}>
                    <span className="fi-tile-i" aria-hidden="true"><Icon name={t.icon} size={15} /></span>
                    <div>
                      <dt>{t.k}</dt>
                      <dd>{t.v}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            )}

            <Timeline rows={dates} />

            <div className="fi-cta">
              {canApply ? (
                <a className="btn fi-go" href={`/apply/${ipo.symbol}`}>
                  <span>{ipo.status === 'upcoming' ? LABEL.preApply : LABEL.applyNow}</span>
                  <Icon name="arrow-right" size={16} />
                </a>
              ) : (
                <a className="btn fi-go" href={ipoUrl(ipo as any)}>
                  <span>View IPO details</span>
                  <Icon name="arrow-right" size={16} />
                </a>
              )}
              {/* PRINT FORMS GAVE THIS SLOT TO APPLY (operator ask, 17 Oct). It is
                  not lost — the IPO card and the detail page both still offer it,
                  and this is the consumer home page, where Apply is the action.
                  Apply still reads `extra.startBid`: a button that lands on
                  "Bidding hasn't started yet" is worse than no button, which is
                  exactly what /apply/<symbol> renders while that gate is off. */}
              {canApply && (
                <a className="btn btn-ghost fi-alt" href={ipoUrl(ipo as any)}>View IPO details</a>
              )}
            </div>

            {(registrar || faceValue > 0) && (
              <div className="fi-meta">
                {faceValue > 0 && <span>Face value <b>₹{faceValue}</b></span>}
                {registrar && <span>Registrar <b>{registrar}</b></span>}
              </div>
            )}

            <button type="button" className="fi-later" onClick={close}>Not now</button>

            <p className="fi-fine">
              Investoyard is an IPO distribution platform and does not provide investment advice.
              IPO investment is subject to market risk — read the Red Herring Prospectus before investing.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
