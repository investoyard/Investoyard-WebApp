'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getBanners, getIpos, type BannerView, type IpoFull } from '@/lib/api';
import { IpoLogo } from '@/components/IpoLogo';
import { Icon } from '@/components/Icon';
import { inr, priceBand } from '@/lib/format';
import * as calc from '@/lib/ipoCalc';
import { useTenant } from '@/components/TenantProvider';
import { Lang } from '@investoyard/i18n';
import { LABEL, demandWord, titleCase, shortName } from '@investoyard/shared-types';
import { RETAIL_MAX_AMOUNT, SNII_MAX_AMOUNT } from '@investoyard/shared-types';

/**
 * Compact dynamic homepage banner — replaces the tall static hero.
 * Slides are AUTO-GENERATED from the live catalog (every open IPO + issues
 * opening within a week), with the brand tagline as the first/fallback slide,
 * so the page markets today's action first (the IPOJI lesson) while staying
 * on-brand. Auto-rotates every 5s; arrows, dots, hover-pause, swipe.
 */

const dayIso = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function daysUntil(date?: string): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${dayIso()}T00:00:00`).getTime()) / 86400000);
}

/**
 * Slide status tag. `cls` is a TONE from the shared stage map rather than a
 * colour this file picks, so the dark and pastel slides cannot disagree about
 * what a status looks like — the pastel one used to paint Closing today RED
 * against the dark one's gold, the same status two slides apart.
 */
function slideTag(ipo: IpoFull): { label: string; cls: string; urgent?: boolean } {
  const today = dayIso();
  if (ipo.status === 'open') {
    if (ipo.closeDate === today) return { label: 'Closing today', cls: 't-closing', urgent: true };
    if (ipo.openDate === today) return { label: 'Open today', cls: 't-live' };
    return { label: 'Live', cls: 't-live' };
  }
  const d = daysUntil(ipo.openDate);
  if (d != null && d <= 1) return { label: d <= 0 ? 'Opens today' : 'Opens tomorrow', cls: 't-upcoming' };
  return { label: d != null ? `Opens in ${d}d` : 'Upcoming', cls: 't-upcoming' };
}

/**
 * "2026-09-01" → "1 Sep".
 *
 * Hand-formatted rather than toLocaleDateString: en-IN renders September as
 * "Sept" — four letters where every other month is three — which made the
 * lifecycle rail's date column look ragged. Parsing the ISO string directly is
 * also deterministic, so the static export and the client always agree.
 */
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtD = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s)
  ? `${+s.slice(8, 10)} ${MON3[+s.slice(5, 7) - 1]}` : '—');

/**
 * Live countdown to the close of bidding (3pm cut-off on the closing day).
 * Starts null so the static export and the first client render agree, then
 * ticks every second — the urgency device on a "Closing today" slide.
 */
function useCountdown(closeDate?: string): string | null {
  const [left, setLeft] = useState<string | null>(null);
  useEffect(() => {
    if (!closeDate || !/^\d{4}-\d{2}-\d{2}$/.test(closeDate)) return;
    const end = new Date(`${closeDate}T15:00:00`).getTime(); // exchange cut-off
    const tick = () => {
      const ms = end - Date.now();
      if (ms <= 0) { setLeft(null); return; }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setLeft(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [closeDate]);
  return left;
}

/**
 * Actual listing outcome for a listed issue — price from the admin-entered
 * NSE/BSE listing price, gain from listingGainPct; each derives the other from
 * the band ceiling. null until any listing data exists.
 */
function listingInfo(ipo: IpoFull): { price?: number; gainPct?: number } | null {
  if (ipo.status !== 'listed') return null;
  const ex: any = (ipo as any).extra ?? {};
  const issue = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
  let price = Number(String(ex.nseListingPrice || ex.bseListingPrice || '').replace(/[^\d.]/g, '')) || 0;
  let gainPct = ipo.listingGainPct ?? undefined;
  if (!price && gainPct != null && issue) price = Math.round(issue * (1 + gainPct / 100));
  if (gainPct == null && price && issue) gainPct = Math.round(((price - issue) / issue) * 1000) / 10;
  if (!price && gainPct == null) return null;
  return { price: price || undefined, gainPct };
}

export function HeroBanner({ ipos: baked, lang = 'en' }: { ipos: IpoFull[]; lang?: Lang }) {
  const q = lang !== 'en' ? `?lang=${lang}` : '';
  const [ipos, setIpos] = useState<IpoFull[]>(baked);
  const [idx, setIdx] = useState(0);
  const paused = useRef(false);
  const touchX = useRef<number | null>(null);

  // refresh with live catalog data client-side (baked props may be the build-time fallback)
  useEffect(() => { getIpos().then((live) => { if (live?.length) setIpos(live as IpoFull[]); }).catch(() => {}); }, []);

  // admin-managed promo slides (Banners page) — shown after the brand slide
  const [banners, setBanners] = useState<BannerView[]>([]);
  useEffect(() => { getBanners().then(setBanners).catch(() => {}); }, []);

  const featured = useMemo(() => {
    const open = ipos.filter((i) => i.status === 'open')
      .sort((a, b) => String(a.closeDate ?? '9') < String(b.closeDate ?? '9') ? -1 : 1);
    const soon = ipos.filter((i) => {
      if (i.status !== 'upcoming') return false;
      const d = daysUntil(i.openDate);
      return d != null && d >= 0 && d <= 7;
    }).sort((a, b) => String(a.openDate ?? '9') < String(b.openDate ?? '9') ? -1 : 1);
    return [...open, ...soon].slice(0, 6);
  }, [ipos]);

  /** The leading brand slides hold the screen longer than the data slides so the
   *  branding actually registers before the catalog starts.
   *
   *  FOUR are in rotation while the operator picks: 0 hero · 1 promise wall ·
   *  2 numbers (light) · 3 three-steps (ink). Two will be deleted after the
   *  review — see LIGHT_BRAND_SLIDES below when removing one. */
  const BRAND_SLIDES = 4;

  /** The IPO slides in render order. While the pastel treatment is under review
   *  the first PASTEL_TWINS issues appear in both treatments back to back; the
   *  cap keeps the rotation from ballooning as the catalog grows. */
  const PASTEL_TWINS = 2;
  const ipoSlides = useMemo(
    () => featured.flatMap((ipo, i) => (i < PASTEL_TWINS
      ? [{ ipo, pastel: false }, { ipo, pastel: true }]
      : [{ ipo, pastel: false }])),
    [featured],
  );
  const slideCount = BRAND_SLIDES + banners.length + ipoSlides.length;
  const dwellMs = idx < BRAND_SLIDES ? 9000 : 5000;

  // Auto-rotate on a ticking timer rather than a fixed interval: the dwell
  // differs per slide, and the accumulated elapsed time also drives the
  // progress bar and survives hover-pause without restarting the slide.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (slideCount <= 1) return;
    setElapsed(0);
    const STEP = 100;
    let acc = 0;
    const t = setInterval(() => {
      if (paused.current) return;
      acc += STEP;
      setElapsed(acc);
      if (acc >= dwellMs) setIdx((i) => (i + 1) % slideCount);
    }, STEP);
    return () => clearInterval(t);
  }, [idx, slideCount, dwellMs]);
  useEffect(() => { if (idx >= slideCount) setIdx(0); }, [slideCount, idx]);

  // the promise slides walk their chips one at a time while on screen — both
  // the dark version (1) and the pastel one under review (3) share the counter
  // so the two animate identically and only the treatment differs
  const [focus, setFocus] = useState(0);
  useEffect(() => {
    if (idx !== 1 && idx !== 3) return;
    setFocus(0);
    const t = setInterval(() => setFocus((f) => (f + 1) % PROMISES.length), 900);
    return () => clearInterval(t);
  }, [idx]);

  const go = (n: number) => setIdx(((n % slideCount) + slideCount) % slideCount);

  // The arrows, dots and progress bar are white — on a light slide they would
  // vanish, so the whole carousel flips to dark chrome while one is on screen.
  // Both the pastel BRAND slides and the pastel IPO twins count as light.
  const lightNow = LIGHT_BRAND_SLIDES.has(idx)
    || ipoSlides[idx - BRAND_SLIDES - banners.length]?.pastel === true;

  return (
    <section
      className={`hb fade-up${lightNow ? ' hb--light' : ''}`}
      aria-roledescription="carousel"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="hb-track" style={{ transform: `translateX(-${idx * 100}%)` }}>
        {/* slides 0–3 — the brand set (also the fallback when the catalog is quiet) */}
        <BrandSlide
          q={q}
          open={ipos.filter((i) => i.status === 'open').length}
          upcoming={ipos.filter((i) => i.status === 'upcoming').length}
        />
        <PromiseSlide q={q} focus={focus} />
        {/* the same two, in pastel — under review */}
        <PastelHeroSlide
          q={q}
          open={ipos.filter((i) => i.status === 'open').length}
          upcoming={ipos.filter((i) => i.status === 'upcoming').length}
        />
        <PastelPromiseSlide q={q} focus={focus} />

        {/* admin-managed promo slides */}
        {banners.map((b) => (
          <div
            className={`hb-slide promo${b.imageUrl ? ' img' : ''}`}
            key={b.id}
            style={b.imageUrl ? { backgroundImage: `linear-gradient(90deg, rgba(22,16,52,.72), rgba(22,16,52,.2)), url(${b.imageUrl})` } : undefined}
          >
            <div className="hb-main">
              <div className="hb-name" title={b.title}>{b.title}</div>
              {b.subtitle && <div className="hb-meta" style={{ whiteSpace: 'normal' }}>{b.subtitle}</div>}
            </div>
            {b.linkUrl && (
              <div className="hb-ctas">
                <a className="btn btn-white" href={b.linkUrl}>{b.ctaLabel || 'Know more'} <Icon name="arrow-right" size={15} /></a>
              </div>
            )}
          </div>
        ))}

        {/* Auto-generated IPO slides — `active` gates the lane animation so it
            plays when the slide arrives, not for every slide on page load.

            While the pastel treatment is under review each of the first few
            IPOs renders TWICE, dark then pastel, so the two are judged on
            identical data rather than on different issues. `ipoSlides` holds
            that flattened order; drop it back to `featured.map` when the
            decision is made. */}
        {ipoSlides.map((s, i) => (
          s.pastel
            ? <PastelIpoSlide key={`${s.ipo.id}-p`} ipo={s.ipo} q={q} />
            : <IpoSlide key={s.ipo.id} ipo={s.ipo} q={q} active={idx === BRAND_SLIDES + banners.length + i} />
        ))}
      </div>

      {slideCount > 1 && (
        <>
          <button type="button" className="hb-arrow prev" aria-label="Previous banner" onClick={() => go(idx - 1)}>
            <Icon name="chevron-left" size={16} />
          </button>
          <button type="button" className="hb-arrow next" aria-label="Next banner" onClick={() => go(idx + 1)}>
            <Icon name="chevron-right" size={16} />
          </button>
          <div className="hb-dots" role="tablist" aria-label="Banner slides">
            {Array.from({ length: slideCount }).map((_, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === idx} aria-label={`Slide ${i + 1}`}
                className={`hb-dot ${i === idx ? 'on' : ''}`} onClick={() => go(i)} />
            ))}
          </div>
          {/* a 9-second slide needs to show it's still moving */}
          <span className="hb-prog" aria-hidden>
            <i style={{ width: `${Math.min(100, (elapsed / dwellMs) * 100)}%` }} />
          </span>
        </>
      )}
    </section>
  );
}

/** ₹ in the compact Indian form a bid range reads best in. */
function money(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}


/** Cloud silhouette shared with the admin sign-in hero (same design language). */
const CLOUD = 'M22 60 C8 60 2 50 8 42 C0 32 12 22 24 26 C26 10 50 6 62 18 C72 6 96 8 100 24 C118 20 134 32 126 46 C136 50 134 60 122 60 Z';

/**
 * All eight promises from the sign-in hero. Labels are deliberately two words —
 * a 4-across chip is ~100px of usable text width, and the full sign-in wording
 * ("Modify Bids Anytime") truncates there. The `title` attribute carries the
 * longer phrase for anyone who hovers.
 */
const PROMISES: { icon: 'user-plus' | 'edit' | 'chart' | 'pie' | 'search' | 'refresh' | 'bell' | 'cursor'; title: string; full: string; tone: string }[] = [
  { icon: 'user-plus', title: '2-Min Signup', full: '2-minute paperless registration', tone: 'ind' },
  { icon: 'edit', title: 'Modify Bids', full: 'Modify bids any time before the close', tone: 'ind' },
  { icon: 'chart', title: 'Live Subs', full: 'Live subscription — demand every hour', tone: 'blu' },
  { icon: 'pie', title: 'Allotment Odds', full: 'Smart allotment insights before listing', tone: 'blu' },
  { icon: 'search', title: 'Smart Insights', full: 'Real-time analytics on every issue', tone: 'blu' },
  { icon: 'refresh', title: 'Mandate Retry', full: 'One-click retry for failed mandates', tone: 'grn' },
  { icon: 'bell', title: 'IPO Alerts', full: 'Never miss an IPO — alerts on every date', tone: 'grn' },
  { icon: 'cursor', title: '3-Click Apply', full: 'Apply in 3 clicks — self & family', tone: 'gld' },
];

/**
 * Brand slide — carries the sign-in hero's design language onto the front site:
 * drifting clouds, the paper plane and its dashed trail, dotted corner texture,
 * the Trusted / Secure / Lightning-Fast pills and the promise chips.
 *
 * Rendered on the brand indigo rather than the sign-in screen's pale ground:
 * the banner sits on a light page, so it has to carry its own contrast to be
 * the first thing the eye lands on — and gold reads far louder on indigo.
 */
function BrandSlide({ q, open, upcoming }: { q: string; open: number; upcoming: number }) {
  return (
    <div className="hb-slide brand2">
      {/* atmosphere */}
      <span className="hb2-deco" aria-hidden>
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`hb2-cloud k${n}`}>
            <svg width={150} height={66} viewBox="0 0 140 62"><path fill="currentColor" d={CLOUD} /></svg>
          </span>
        ))}
        <span className="hb2-tex t-tr" />
        <span className="hb2-tex t-bl" />
        <span className="hb2-plane">
          <svg width={186} height={78} viewBox="0 0 192 80" fill="none">
            <path d="M4 72 C 20 70, 30 64, 36 55 C 42 45, 34 40, 30 46 C 25 53, 34 60, 47 55 C 80 42, 104 44, 124 40"
              stroke="rgba(255,255,255,.45)" strokeWidth={2} strokeDasharray="1.5 8" strokeLinecap="round" />
            <circle cx={4} cy={72} r={3} fill="rgba(255,255,255,.55)" />
            <path d="M186 6 L160 44 L150 31 L133 37 Z" fill="#FFCB32" />
            <path d="M186 6 L150 31 L160 44 Z" fill="#e0a200" />
          </svg>
        </span>
      </span>

      <div className="hb-main hb2-main">
        <span className="hb2-badges">
          <span className="hb2-badge"><Icon name="shield" size={13} /> Trusted</span>
          <span className="hb2-badge"><Icon name="lock" size={13} /> Secure</span>
          <span className="hb2-badge"><Icon name="bolt" size={13} /> Lightning Fast</span>
        </span>
        <h1 className="hb2-h">
          Investing in IPOs,<br />Has <span className="hb2-accent">Never Been This Easy!</span>
        </h1>
        <p className="hb2-sub">
          Everything you need — from registration to allotment — on one platform.
          {open > 0 && <> <b>{open} open now</b>{upcoming > 0 ? <> · {upcoming} upcoming</> : null}.</>}
        </p>
        <div className="hb-ctas hb2-ctas">
          <a className="btn btn-gold" href="#ipos">Explore IPOs <Icon name="arrow-right" size={15} /></a>
          <a className="btn btn-ondark" href={`/login${q}`}>Apply for family</a>
        </div>
      </div>

      {/* the line that says it in one breath — set as a stagger so the second
          half reaches into the space the plane leaves on the right */}
      {/* Mixed script by design — the two English words are the ones every
          investor already uses, so the line reads faster than full Devanagari.
          No lang="hi" on the wrapper: only the Hindi spans carry it. */}
      <div className="hb2-hindi">
        <span className="q" aria-hidden>“</span>
        <p>
          <span className="l1">Demat <span lang="hi">कहीं भी,</span></span>
          <span className="l2">Apply <span lang="hi">इधर ही</span></span>
        </p>
        <span className="tr">Demat anywhere — apply right here</span>
      </div>
    </div>
  );
}

/**
 * Brand slide 2 — the promise wall.
 *
 * The tagline holds the left; the eight capabilities sit on the right and
 * SPOTLIGHT one at a time while the slide is on screen. The walk gives the eye
 * somewhere to go during a long dwell, which is what earns the extra seconds
 * instead of just making the viewer wait.
 */
function PromiseSlide({ q, focus }: { q: string; focus: number }) {
  return (
    <div className="hb-slide brand2 promise">
      <span className="hb2-deco" aria-hidden>
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`hb2-cloud k${n}`}>
            <svg width={150} height={66} viewBox="0 0 140 62"><path fill="currentColor" d={CLOUD} /></svg>
          </span>
        ))}
        <span className="hb2-tex t-tr" />
        <span className="hb2-tex t-bl" />
      </span>

      <div className="hb-main hb2-main">
        <span className="hb2-badges">
          <span className="hb2-badge"><Icon name="sparkle" size={13} /> Mainboard &amp; SME · India</span>
        </span>
        <h1 className="hb2-h">
          Invest in IPOs with <span className="hb2-accent">“Blink of Eye”</span> with Investoyard.
        </h1>
        <p className="hb2-sub">Eight things we do so you never miss an issue — or an allotment.</p>
        <div className="hb-ctas hb2-ctas">
          <a className="btn btn-gold" href="#ipos">Explore IPOs <Icon name="arrow-right" size={15} /></a>
          <a className="btn btn-ondark" href={`/login${q}`}>Create free account</a>
        </div>
      </div>

      <div className="hb2-promises big">
        {PROMISES.map((p, i) => (
          <span key={p.title} className={`hb2-chip c-${p.tone}${i === focus ? ' on' : ''}`} title={p.full}>
            <span className="ic"><Icon name={p.icon} size={19} strokeWidth={2.1} /></span>
            <span className="tx">
              <b>{p.title}</b>
              <i>{p.full}</i>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   CANDIDATE BRAND SLIDES C and D — under review alongside the two above.

   Same WORDS as slides 0 and 1, a different treatment: light pastel ground,
   indigo ink, and the composition mirrored so the visual leads on the left and
   the copy answers on the right. Holding the content constant is the point —
   it makes the four a straight judgement on treatment rather than on wording.

   Pastel tints are the ones already used by the IPO category lanes (lavender
   #CBBFFF, peach #FFD3A5, mint #A9E5C8) so the banner stays internally
   consistent. Two of the four get deleted once the operator decides.
   ══════════════════════════════════════════════════════════════════════════ */

/** Brand slides rendered on a LIGHT ground — the carousel chrome (arrows, dots,
 *  progress) inverts while one of these is showing, or it would disappear.
 *  Keep in step with the slide order in the track when slides change. */
const LIGHT_BRAND_SLIDES = new Set([2, 3]);

/** Shared pastel atmosphere: soft colour blobs and the dotted texture, in place
 *  of the dark slides' clouds and paper plane. */
function PastelDeco() {
  return (
    <span className="hbp-deco" aria-hidden>
      <span className="hbp-blob b1" />
      <span className="hbp-blob b2" />
      <span className="hbp-blob b3" />
      <span className="hbp-tex" />
    </span>
  );
}

/**
 * CANDIDATE C — slide 0's content in pastel, mirrored.
 *
 * The Hindi statement leads on the left as the hero rather than trailing on the
 * right, and the English copy answers it. Identical badges, headline, sub-line
 * (with the same live open/upcoming counts) and CTAs.
 */
function PastelHeroSlide({ q, open, upcoming }: { q: string; open: number; upcoming: number }) {
  return (
    <div className="hb-slide hb-pastel">
      <PastelDeco />

      <div className="hbp-hindi">
        <span className="q" aria-hidden>“</span>
        <p>
          <span className="l1">Demat <span lang="hi">कहीं भी,</span></span>
          <span className="l2">Apply <span lang="hi">इधर ही</span></span>
        </p>
        <span className="tr">Demat anywhere — apply right here</span>
      </div>

      <div className="hb-main hbp-main">
        <span className="hbp-badges">
          <span className="hbp-badge"><Icon name="shield" size={13} /> Trusted</span>
          <span className="hbp-badge"><Icon name="lock" size={13} /> Secure</span>
          <span className="hbp-badge"><Icon name="bolt" size={13} /> Lightning Fast</span>
        </span>
        <h1 className="hbp-h">
          Investing in IPOs,<br />Has <span className="hbp-mark">Never Been This Easy!</span>
        </h1>
        <p className="hbp-sub">
          Everything you need — from registration to allotment — on one platform.
          {open > 0 && <> <b>{open} open now</b>{upcoming > 0 ? <> · {upcoming} upcoming</> : null}.</>}
        </p>
        <div className="hb-ctas hbp-ctas">
          <a className="btn btn-gold" href="#ipos">Explore IPOs <Icon name="arrow-right" size={15} /></a>
          <a className="btn btn-inkline" href={`/login${q}`}>Apply for family</a>
        </div>
      </div>
    </div>
  );
}

/**
 * CANDIDATE D — slide 1's content in pastel, mirrored.
 *
 * The same eight promises, as solid pastel tiles on the left instead of glass
 * chips on the right, walking one at a time on the same `focus` counter so both
 * versions animate identically and only the treatment differs.
 */
function PastelPromiseSlide({ q, focus }: { q: string; focus: number }) {
  return (
    <div className="hb-slide hb-pastel promise">
      <PastelDeco />

      <div className="hbp-promises">
        {PROMISES.map((p, i) => (
          <span key={p.title} className={`hbp-chip c-${p.tone}${i === focus ? ' on' : ''}`} title={p.full}>
            <span className="ic"><Icon name={p.icon} size={17} strokeWidth={2.1} /></span>
            <b>{p.title}</b>
          </span>
        ))}
      </div>

      <div className="hb-main hbp-main">
        <span className="hbp-badges">
          <span className="hbp-badge"><Icon name="sparkle" size={13} /> Mainboard &amp; SME · India</span>
        </span>
        <h1 className="hbp-h">
          Invest in IPOs with <span className="hbp-mark">“Blink of Eye”</span> with Investoyard.
        </h1>
        <p className="hbp-sub">Eight things we do so you never miss an issue — or an allotment.</p>
        <div className="hb-ctas hbp-ctas">
          <a className="btn btn-gold" href="#ipos">Explore IPOs <Icon name="arrow-right" size={15} /></a>
          <a className="btn btn-inkline" href={`/login${q}`}>Create free account</a>
        </div>
      </div>
    </div>
  );
}


/** ₹ figures in the banner, in the Indian grouping. */
const nf = (n: number) => Math.round(n).toLocaleString('en-IN');

export interface CategoryLane {
  key: string; tone: string; range: string;
  shares: number; amount: number;
  forms?: number; gain?: number; resv?: number;
}

/**
 * The per-category figures both IPO treatments render — derived ONCE here so the
 * dark lanes and the pastel cards can never drift apart.
 *
 * Bid floors come from the same rule the bid engine uses: retail is one lot up
 * to ₹2L, S-HNI above that to ₹10L, B-HNI beyond. Returns [] when the issue has
 * no price band or lot size yet, which is the caller's cue to render nothing.
 */
function categoryLanes(ipo: IpoFull, showGmp: boolean): CategoryLane[] {
  const lot = ipo.lotSize ?? 0;
  const perLot = lot * (ipo.priceBandMax ?? ipo.priceBandMin ?? 0);
  if (perLot <= 0) return [];

  const pct = new Map(calc.reservation(ipo).filter((r) => r.pct > 0).map((r) => [r.cat, r.pct]));
  const rMax = Math.max(1, Math.floor(RETAIL_MAX_AMOUNT / perLot));
  const sMin = rMax + 1;
  const sMax = Math.max(sMin, Math.floor(SNII_MAX_AMOUNT / perLot));
  const bMin = sMax + 1;

  const row = (key: string, tone: string, resvKey: string, minLots: number, range: string, forms?: number): CategoryLane => ({
    key, tone, range,
    shares: minLots * lot,
    amount: minLots * perLot,
    forms,
    // arithmetic on an unofficial number — labelled as an estimate, never a promise
    gain: showGmp ? minLots * lot * (ipo.gmp as number) : undefined,
    resv: pct.get(resvKey),
  });

  return [
    row('Retail', 'ret', 'Retail', 1, `1–${rMax}`, ipo.formsFor1x?.retail),
    row('sHNI', 'shni', 'S-HNI', sMin, `${sMin}–${sMax}`, ipo.formsFor1x?.sHni),
    row('bHNI', 'bhni', 'B-HNI', bMin, `${bMin}+`, ipo.formsFor1x?.bHni),
  ];
}

/* ── CANDIDATE: the IPO slide in pastel (under review beside the dark one) ──
   Same data, read along the other axis. The dark slide lays the categories out
   as ROWS in a table; here each category is its own CARD, so the figures for
   one investor type read top-to-bottom as a single unit instead of being
   tracked across a row. The dates chip is replaced by a lifecycle rail, which
   answers something the dark slide cannot: where this issue is in its life. */

/** Open → Close → Allotment → Listing, with the passed steps filled.
 *  Driven by the DATES, not by `status` — the operator often forgets to advance
 *  the status, and stage.ts takes the same position. */
function LifeRail({ ipo }: { ipo: IpoFull }) {
  const steps = [
    { k: 'Open', d: ipo.openDate },
    { k: 'Close', d: ipo.closeDate },
    { k: 'Allotment', d: (ipo as any).allotmentDate as string | undefined },
    { k: 'Listing', d: (ipo as any).listingDate as string | undefined },
  ];
  const done = steps.map((s) => { const n = daysUntil(s.d); return n != null && n <= 0; });
  const current = done.lastIndexOf(true) + 1; // the next step still ahead

  return (
    <div className="hbi-rail" aria-label="IPO lifecycle">
      {steps.map((s, i) => (
        <div className={`hbi-step${done[i] ? ' done' : ''}${i === current ? ' now' : ''}`} key={s.k}>
          <span className="dot" aria-hidden />
          <b>{s.k}</b>
          <i>{fmtD(s.d)}</i>
        </div>
      ))}
    </div>
  );
}

function PastelIpoSlide({ ipo, q }: { ipo: IpoFull; q: string }) {
  const tag = slideTag(ipo);
  const canApply = (ipo as any).extra?.startBid === true;
  const canPrint = (ipo as any).extra?.startPrint === true;
  const closing = tag.urgent === true;
  const countdown = useCountdown(closing ? ipo.closeDate : undefined);
  const tenant = useTenant();
  const showGmp = tenant.flags.gmpEnabled && ipo.gmp != null;
  const lanes = categoryLanes(ipo, showGmp);
  const hasGmpData = lanes.some((l) => l.gain != null);

  return (
    <div className="hb-slide hb-ipopastel">
      <PastelDeco />

      <div className="hbi-left">
        <div className="hbi-ident">
          <IpoLogo logo={ipo.logo} name={ipo.name} size={40} />
          <div style={{ minWidth: 0 }}>
            <div className="hbi-name" title={titleCase(ipo.name)}>{shortName(ipo.name)}</div>
            <div className="hbi-meta">
              <span className={`hbi-board ${ipo.type === 'sme' ? 'sme' : 'mb'}`}>{ipo.type === 'sme' ? 'SME' : 'Mainboard'}</span>
              <span className="sym">{ipo.symbol}</span>
              <span className={`hbi-tag ${tag.cls}`}>{closing && <span className="hb-pulse" />}{tag.label}</span>
            </div>
          </div>
        </div>

        {/* Two headline figures at equal weight: the price band and the lot
            size. Min Application is derived from both and still sits on the
            card, so it does not earn banner space. */}
        <div className="hbi-hero">
          <span className="fig">
            <i>{LABEL.offerPrice}</i>
            <b>{priceBand(ipo.priceBandMin, ipo.priceBandMax)}</b>
          </span>
          <span className="fig">
            <i>{LABEL.lotSize}</i>
            <b>{ipo.lotSize ?? '—'}</b>
          </span>
          {/* the issue size is context, not a decision input like the band and
              the lot — it sits a step down in the hierarchy */}
          <span className="fig sm">
            <i>{LABEL.issueSize}</i>
            <b>{ipo.issueSize ?? '—'}</b>
          </span>
        </div>

        <LifeRail ipo={ipo} />

        <div className="hb-ctas hbi-ctas">
          {canApply && (
            <a className="btn btn-gold" href={`/apply/${ipo.symbol}${q}`}>
              {ipo.status === 'upcoming' ? LABEL.preApply : LABEL.applyNow} <Icon name="arrow-right" size={15} />
            </a>
          )}
          {canPrint && <a className="btn btn-inkline" href={`/print/${ipo.symbol}${q}`}>{LABEL.printForms} <Icon name="file-pdf" size={14} /></a>}
          {!canApply && !canPrint && <a className="btn btn-inkline" href={`/ipos/${ipo.slug ?? ipo.symbol}${q}`}>View details <Icon name="arrow-right" size={15} /></a>}
          {countdown && <span className="hbi-cd"><i>Closes in</i><b className="mono">{countdown}</b></span>}
        </div>
      </div>

      <div className="hbi-cards">
        {showGmp && <span className="hbi-gmp">GMP +₹{ipo.gmp}</span>}
        <div className="hbi-grid">
          {lanes.map((l) => (
            <div className={`hbi-card t-${l.tone}`} key={l.key}>
              <span className="hd">{l.key}{l.resv != null && <i>{l.resv}%</i>}</span>
              <span className="row"><i>Min Shares</i><b>{nf(l.shares)} <em>Sh</em></b></span>
              {/* amount before the lot range — the money is the decision, the
                  range is the constraint on it */}
              <span className="row"><i>Amount</i><b>₹{nf(l.amount)}</b></span>
              <span className="row"><i>Lots</i><b>{l.range}</b></span>
              <span className="row"><i>For 1×</i><b className={l.forms == null ? 'na' : undefined}>{l.forms != null ? nf(l.forms) : '—'}</b></span>
              <span className="row"><i>Est. gain</i><b className={l.gain != null ? 'gain' : 'na'}>{l.gain != null ? `+${nf(l.gain)}` : '—'}</b></span>
            </div>
          ))}
        </div>
        {/* identical wording to the dark slide — a grey-market figure on screen
            always carries the disclaimer */}
        {hasGmpData && <span className="hbi-note">Est. gain at GMP · grey market is unofficial — not investment advice.</span>}
      </div>
    </div>
  );
}

/**
 * One IPO slide — identity and actions on the left, a LIVE PANEL on the right
 * carrying the figures a visitor actually came for (GMP with implied gain,
 * subscription, and a ticking countdown on the closing day). Depth comes from
 * the company logo bled off the right edge as a watermark plus a gold aurora,
 * and the accent colour follows the stage so slides don't all read alike.
 */
function IpoSlide({ ipo, q, active }: { ipo: IpoFull; q: string; active: boolean }) {
  const tag = slideTag(ipo);
  const canApply = (ipo as any).extra?.startBid === true;
  const canPrint = (ipo as any).extra?.startPrint === true;
  const closing = tag.urgent === true;
  const countdown = useCountdown(closing ? ipo.closeDate : undefined);

  return (
    <div className={`hb-slide ipo acc-${tag.cls}`}>
      {/* depth: aurora wash + the company mark bleeding off the right edge */}
      <span className="hb-aurora" aria-hidden />
      {ipo.logo && <img className="hb-watermark" src={ipo.logo} alt="" aria-hidden />}

      <div className="hb-main">
        <div className="hb-iporow">
          <IpoLogo logo={ipo.logo} name={ipo.name} size={46} />
          <div style={{ minWidth: 0 }}>
            <div className="hb-name" title={titleCase(ipo.name)}>{titleCase(ipo.name)}</div>
            {/* status now sits WITH the identity rather than across the row */}
            <div className="hb-meta">
              <span className={`hb-board ${ipo.type === 'sme' ? 'sme' : 'mb'}`}>{ipo.type === 'sme' ? 'SME' : 'Mainboard'}</span>
              {ipo.symbol}
              <span className={`hb-tag ${tag.cls}`}>{closing && <span className="hb-pulse" />}{tag.label}</span>
            </div>
          </div>
        </div>

        {/* the decision numbers, in the product's vocabulary */}
        <div className="hb-specs">
          <span><i>{LABEL.offerPrice}</i>{priceBand(ipo.priceBandMin, ipo.priceBandMax)}</span>
          <span><i>{LABEL.lotSize}</i>{ipo.lotSize ?? '—'}</span>
          <span><i>{LABEL.minApplication}</i>{inr(ipo.minAmount)}</span>
          <span><i>{LABEL.issueSize}</i>{ipo.issueSize ?? '—'}</span>
        </div>

        {/* dates stay in place but read as a highlighted chip, not muted text */}
        <div className={`hb-dates${closing ? ' urgent' : ''}`}>
          <Icon name="calendar" size={15} />
          <b>{fmtD(ipo.openDate)} – {fmtD(ipo.closeDate)}</b>
          {(() => {
            if (ipo.status !== 'open') return null;
            const d = daysUntil(ipo.closeDate);
            if (d == null || d < 0) return null;
            return <em>{d === 0 ? 'closes today, 3 pm' : d === 1 ? 'closes tomorrow' : `closes in ${d} days`}</em>;
          })()}
        </div>

        <div className="hb-ctas">
          {canApply && (
            <a className="btn btn-gold" href={`/apply/${ipo.symbol}${q}`}>
              {ipo.status === 'upcoming' ? LABEL.preApply : LABEL.applyNow} <Icon name="arrow-right" size={15} />
            </a>
          )}
          {canPrint && <a className="btn btn-ondark" href={`/print/${ipo.symbol}${q}`}>{LABEL.printForms} <Icon name="file-pdf" size={14} /></a>}
          {!canApply && !canPrint && <a className="btn btn-white" href={`/ipos/${ipo.slug ?? ipo.symbol}${q}`}>View details <Icon name="arrow-right" size={15} /></a>}
        </div>
      </div>

      {/* ── right: the category lanes ── */}
      <IssueMatrix ipo={ipo} countdown={countdown} active={active} />
    </div>
  );
}

/** Deterministic candlestick backdrop — fixed, never random, so SSR and the
 *  client render the same marks. Reads as "markets" at 6% opacity. */
const CANDLES = [
  [10, 26, 6, 34], [22, 20, 4, 30], [34, 30, 8, 40], [46, 16, 3, 26], [58, 24, 6, 34],
  [70, 12, 4, 22], [82, 20, 7, 30], [94, 8, 3, 18], [106, 14, 5, 24], [118, 4, 4, 14],
] as const;

function CandleBackdrop() {
  return (
    <svg className="hb-mxbg" viewBox="0 0 132 46" preserveAspectRatio="none" aria-hidden focusable="false">
      {CANDLES.map(([x, y, w, wickH], i) => (
        <g key={i}>
          <rect x={x + w / 2 - 0.5} y={y - 4} width={1} height={wickH} rx={0.5} />
          <rect x={x} y={y} width={w} height={Math.max(4, wickH - 10)} rx={1.2} />
        </g>
      ))}
    </svg>
  );
}

/**
 * Category lanes — one soft lane per investor category, carrying every figure
 * that decides a bid: shares (with the allowed lot range), the amount, how many
 * applications fill 1×, and the gain the current GMP implies.
 *
 * Lanes rather than a cell grid so the eye tracks a category across in one
 * sweep; pastel edges colour-code without a chart. Lanes animate in only when
 * the slide becomes active. Columns with no data across all three categories
 * remove themselves rather than printing a wall of dashes.
 */
function IssueMatrix({ ipo, countdown, active }: { ipo: IpoFull; countdown: string | null; active: boolean }) {
  const li = listingInfo(ipo);
  const tenant = useTenant();
  const showGmp = tenant.flags.gmpEnabled && ipo.gmp != null;
  const lanes = categoryLanes(ipo, showGmp);

  // Both derived columns ALWAYS render — a dash tells the reader the metric
  // exists and is pending, where a missing column just looks like it never did.
  const hasGmpData = lanes.some((l) => l.gain != null);
  if (lanes.length === 0) return null;

  return (
    <div className={`hb-mx${active ? ' on' : ''}`}>
      <CandleBackdrop />

      {(li || showGmp) && (
        <div className="hb-mxhead">
          {li ? (
            <span className={`hb-mxpill ${(li.gainPct ?? 0) >= 0 ? 'up' : 'down'}`}>
              Listed {li.price ? `₹${li.price}` : ''}{li.gainPct != null ? ` ${(li.gainPct ?? 0) >= 0 ? '+' : ''}${li.gainPct}%` : ''}
            </span>
          ) : (
            <span className="hb-mxpill up">GMP +₹{ipo.gmp}</span>
          )}
        </div>
      )}

      <div className="hb-lanes" role="table">
        <div className="hb-lane hd" role="row">
          <span role="columnheader">Category</span>
          <span role="columnheader">Shares (Lots)</span>
          <span role="columnheader">Amount</span>
          <span role="columnheader">For 1×</span>
          <span role="columnheader">Est. gain</span>
        </div>
        {lanes.map((l) => (
          <div className={`hb-lane t-${l.tone}`} key={l.key} role="row">
            <span className="cat" role="cell">
              {l.key}{l.resv != null && <i>{l.resv}%</i>}
            </span>
            <span className="hb-shr" role="cell">{nf(l.shares)} <i>({l.range})</i></span>
            <span role="cell">{nf(l.amount)}</span>
            <span role="cell" className={l.forms == null ? 'na' : undefined}>{l.forms != null ? nf(l.forms) : '—'}</span>
            <span role="cell" className={l.gain != null ? 'gain' : 'na'}>{l.gain != null ? `+${nf(l.gain)}` : '—'}</span>
          </div>
        ))}
      </div>

      {countdown && (
        <div className="hb-mxcd"><span className="k">Closes in</span><b className="mono">{countdown}</b><span className="s">today, 3 pm</span></div>
      )}
      {/* only when a real GMP is on screen — the column alone, showing dashes,
          isn't presenting a grey-market figure so needs no disclaimer */}
      {hasGmpData && <span className="hb-mxnote">Est. gain at GMP · grey market is unofficial — not investment advice.</span>}
    </div>
  );
}
