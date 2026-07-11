'use client';
import { useEffect, useRef, useState } from 'react';
import { IpoLogo } from '@/components/IpoLogo';

/** In-page section nav with scroll-spy + offset-aware smooth scroll on click.
    Once the hero scrolls out of view it reveals the IPO identity (logo + name +
    status) on the left, so the reader always knows which IPO they're on. */
export function SectionTabs({ items, title, logo, status, statusLabel, autoFocusId }: {
  items: { id: string; label: string }[];
  title?: string; logo?: string; status?: string; statusLabel?: string; autoFocusId?: string;
}) {
  const [active, setActive] = useState(items[0]?.id ?? '');
  const [condensed, setCondensed] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  const scrollToId = (id: string, smooth = true) => {
    const el = document.getElementById(id);
    if (!el) return;
    const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64;
    const navH = navRef.current?.offsetHeight ?? 56;
    const y = window.scrollY + el.getBoundingClientRect().top - (headerH + navH + 12);
    window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
    setActive(id);
  };

  // Live IPO: focus the subscription section on load (only if the user hasn't already scrolled).
  useEffect(() => {
    if (!autoFocusId || window.scrollY > 4) return;
    const t = setTimeout(() => { if (window.scrollY <= 4) scrollToId(autoFocusId); }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusId]);

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 170);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const secs = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    if (!secs.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-120px 0px -55% 0px', threshold: 0 },
    );
    secs.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [items]);

  const go = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    scrollToId(id);
    if (history.replaceState) history.replaceState(null, '', `#${id}`);
  };
  const toTop = (e: React.MouseEvent) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <nav ref={navRef} className={`tabs sticky-tabs ${condensed ? 'condensed' : ''}`} aria-label="Sections">
      {title && (
        <a href="#" className="st-ident" onClick={toTop} aria-label={`${title} — back to top`}>
          <IpoLogo logo={logo} name={title} size={26} />
          <span className="st-name">{title}</span>
          {status && <span className={`ic-dot ${status}`} title={statusLabel} />}
        </a>
      )}
      <div className="st-tablist">
        {items.map((i) => (
          <a key={i.id} className={`tab ${active === i.id ? 'active' : ''}`} href={`#${i.id}`} onClick={(e) => go(e, i.id)}>
            {i.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
