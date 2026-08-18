'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getBanners, getIpos, type BannerView, type IpoFull } from '@/lib/api';
import { IpoLogo } from '@/components/IpoLogo';
import { Icon } from '@/components/Icon';
import { inr, priceBand } from '@/lib/format';
import { Lang } from '@investoyard/i18n';

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
        {featured.map((ipo, i) => {
          const tag = slideTag(ipo);
          const canApply = (ipo as any).extra?.startBid === true;
          const canPrint = (ipo as any).extra?.startPrint === true;
          return (
            <div className={`hb-slide ipo v${i % 3}`} key={ipo.id}>
              <div className="hb-main">
                <div className="hb-iporow">
                  <IpoLogo logo={ipo.logo} name={ipo.name} size={46} />
                  <div style={{ minWidth: 0 }}>
                    <div className="hb-name" title={ipo.name}>{ipo.name}</div>
                    <div className="hb-meta">
                      {ipo.type === 'sme' ? 'SME' : 'Mainboard'} · {priceBand(ipo.priceBandMin, ipo.priceBandMax)}
                      {ipo.lotSize ? <> · Lot {ipo.lotSize}</> : null}
                      {ipo.minAmount ? <> · Min {inr(ipo.minAmount)}</> : null}
                    </div>
                  </div>
                  <span className={`hb-tag ${tag.cls}`}>{tag.label}</span>
                </div>
                <div className="hb-sub">
                  <Icon name="calendar" size={13} /> {fmtD(ipo.openDate)} – {fmtD(ipo.closeDate)}
                  {ipo.status === 'open' && ipo.subscriptionTimes != null && (
                    <span className="hb-subx"><span className="live-dot" /> {ipo.subscriptionTimes}× subscribed</span>
                  )}
                </div>
              </div>
              <div className="hb-ctas">
                {canApply && <a className="btn btn-white" href={`/apply/${ipo.symbol}${q}`}>Apply now <Icon name="arrow-right" size={15} /></a>}
                {canPrint && <a className="btn btn-pdf" href={`/print/${ipo.symbol}${q}`}>Print Forms <Icon name="file-pdf" size={14} /></a>}
                {!canApply && !canPrint && <a className="btn btn-ondark" href={`/ipos/${ipo.symbol}${q}`}>View details</a>}
              </div>
            </div>
          );
        })}
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
