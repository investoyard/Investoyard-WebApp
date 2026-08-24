'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getBanners, getIpos, type BannerView, type IpoFull } from '@/lib/api';
import { IpoLogo } from '@/components/IpoLogo';
import { Icon } from '@/components/Icon';
import { inr, priceBand } from '@/lib/format';
import { Lang } from '@investoyard/i18n';
import { LABEL, demandWord, titleCase } from '@investoyard/shared-types';

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

function slideTag(ipo: IpoFull): { label: string; cls: string } {
  const today = dayIso();
  if (ipo.status === 'open') {
    if (ipo.closeDate === today) return { label: 'Closing today', cls: 'closing' };
    if (ipo.openDate === today) return { label: 'Open today', cls: 'live' };
    return { label: 'Live', cls: 'live' };
  }
  const d = daysUntil(ipo.openDate);
  if (d != null && d <= 1) return { label: d <= 0 ? 'Opens today' : 'Opens tomorrow', cls: 'soon' };
  return { label: d != null ? `Opens in ${d}d` : 'Upcoming', cls: 'soon' };
}

const fmtD = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s)
  ? new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');

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

/** The one figure that anchors an IPO slide, chosen by what the stage makes matter. */
function heroFigure(ipo: IpoFull): { k: string; v: string; sub?: string; tone: 'gold' | 'pos' | 'neg' | 'plain' } | null {
  const band = ipo.priceBandMax ?? ipo.priceBandMin;
  if (ipo.gmp != null && band) {
    const pct = ipo.gmpPct ?? Math.round((ipo.gmp / band) * 1000) / 10;
    return {
      k: 'Grey Market Premium',
      v: `${ipo.gmp >= 0 ? '+' : '−'}₹${Math.abs(ipo.gmp)}`,
      sub: `${pct >= 0 ? '+' : ''}${pct}% est. gain`,
      tone: ipo.gmp >= 0 ? 'pos' : 'neg',
    };
  }
  if (ipo.subscriptionTimes != null) {
    return { k: 'Subscribed', v: `${ipo.subscriptionTimes}×`, sub: demandWord(ipo.subscriptionTimes, ipo.type === 'sme'), tone: 'gold' };
  }
  if (ipo.minAmount != null) {
    return { k: LABEL.minApplication, v: inr(ipo.minAmount), sub: ipo.lotSize ? `${ipo.lotSize} shares / lot` : undefined, tone: 'plain' };
  }
  return null;
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

  const slideCount = 1 + banners.length + featured.length;

  // auto-rotate (hover pauses via ref so the interval never restarts)
  useEffect(() => {
    if (slideCount <= 1) return;
    const t = setInterval(() => { if (!paused.current) setIdx((i) => (i + 1) % slideCount); }, 5000);
    return () => clearInterval(t);
  }, [slideCount]);
  useEffect(() => { if (idx >= slideCount) setIdx(0); }, [slideCount, idx]);

  const go = (n: number) => setIdx(((n % slideCount) + slideCount) % slideCount);

  return (
    <section
      className="hb fade-up"
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
        {/* slide 0 — brand (also the fallback when the catalog is quiet) */}
        <div className="hb-slide brand">
          <div className="hb-main">
            <span className="hb-eyebrow"><Icon name="sparkle" size={13} /> Mainboard &amp; SME · India</span>
            <h1>Investing in IPOs, has never been <span className="gold-word">this easy</span>.</h1>
            <div className="hb-trust">
              <span><b className="mono">{ipos.filter((i) => i.status === 'open').length}</b> Open now</span>
              <span><b className="mono">{ipos.filter((i) => i.status === 'upcoming').length}</b> Upcoming</span>
              <span><b>UPI · ASBA</b> Self &amp; family</span>
            </div>
          </div>
          <div className="hb-ctas">
            <a className="btn btn-white" href="#ipos">Explore IPOs <Icon name="arrow-right" size={15} /></a>
            <a className="btn btn-ondark" href={`/login${q}`}>Apply for family</a>
          </div>
        </div>

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

        {/* auto-generated IPO slides */}
        {featured.map((ipo) => <IpoSlide key={ipo.id} ipo={ipo} q={q} />)}
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
        </>
      )}
    </section>
  );
}

/**
 * One IPO slide — identity and actions on the left, a LIVE PANEL on the right
 * carrying the figures a visitor actually came for (GMP with implied gain,
 * subscription, and a ticking countdown on the closing day). Depth comes from
 * the company logo bled off the right edge as a watermark plus a gold aurora,
 * and the accent colour follows the stage so slides don't all read alike.
 */
function IpoSlide({ ipo, q }: { ipo: IpoFull; q: string }) {
  const tag = slideTag(ipo);
  const canApply = (ipo as any).extra?.startBid === true;
  const canPrint = (ipo as any).extra?.startPrint === true;
  const hero = heroFigure(ipo);
  const closing = tag.cls === 'closing';
  const countdown = useCountdown(closing ? ipo.closeDate : undefined);
  const subX = ipo.subscriptionTimes;

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
            <div className="hb-meta">
              <span className={`hb-board ${ipo.type === 'sme' ? 'sme' : 'mb'}`}>{ipo.type === 'sme' ? 'SME' : 'Mainboard'}</span>
              {ipo.symbol}
            </div>
          </div>
          <span className={`hb-tag ${tag.cls}`}>{closing && <span className="hb-pulse" />}{tag.label}</span>
        </div>

        {/* the decision numbers, in the product's vocabulary */}
        <div className="hb-specs">
          <span><i>{LABEL.offerPrice}</i>{priceBand(ipo.priceBandMin, ipo.priceBandMax)}</span>
          <span><i>{LABEL.lotSize}</i>{ipo.lotSize ?? '—'}</span>
          <span><i>{LABEL.minApplication}</i>{inr(ipo.minAmount)}</span>
          <span><i>{LABEL.issueSize}</i>{ipo.issueSize ?? '—'}</span>
        </div>

        <div className="hb-sub">
          <Icon name="calendar" size={13} /> {fmtD(ipo.openDate)} – {fmtD(ipo.closeDate)}
        </div>

        <div className="hb-ctas">
          {canApply && (
            <a className="btn btn-gold" href={`/apply/${ipo.symbol}${q}`}>
              {ipo.status === 'upcoming' ? LABEL.preApply : LABEL.applyNow} <Icon name="arrow-right" size={15} />
            </a>
          )}
          {canPrint && <a className="btn btn-ondark" href={`/print/${ipo.symbol}${q}`}>{LABEL.printForms} <Icon name="file-pdf" size={14} /></a>}
          {!canApply && !canPrint && <a className="btn btn-white" href={`/ipos/${ipo.symbol}${q}`}>View details <Icon name="arrow-right" size={15} /></a>}
        </div>
      </div>

      {/* ── live panel: the hero figure + supporting tiles ── */}
      {(hero || subX != null || countdown) && (
        <div className="hb-live">
          {hero && (
            <div className={`hb-hero t-${hero.tone}`}>
              <span className="k">{hero.k}</span>
              <span className="v">{hero.v}</span>
              {hero.sub && <span className="s">{hero.sub}</span>}
            </div>
          )}
          <div className="hb-tiles">
            {subX != null && hero?.k !== 'Subscribed' && (
              <div className="hb-tile">
                <span className="k">{LABEL.subscribed}</span>
                <span className="v">{subX}×</span>
                <span className="bar"><i style={{ width: `${Math.max(8, Math.min(100, (subX / 15) * 100))}%` }} /></span>
              </div>
            )}
            {countdown && (
              <div className="hb-tile urgent">
                <span className="k">Closes in</span>
                <span className="v mono">{countdown}</span>
                <span className="s">today, 3:00 pm</span>
              </div>
            )}
          </div>
          {ipo.gmp != null && <span className="hb-disc">GMP is unofficial · not investment advice</span>}
        </div>
      )}
    </div>
  );
}
