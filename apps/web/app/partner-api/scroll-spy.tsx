'use client';
import { useEffect } from 'react';

/**
 * Highlights the active section in the sticky left-hand TOC as the reader
 * scrolls. Ported verbatim from the artifact preview so the on-site page
 * behaves the same way.
 *
 * Runs on mount and on every scroll (throttled through requestAnimationFrame
 * — one measurement per frame, no matter how fast the scroll fires). Reads
 * offsetTop rather than using IntersectionObserver: for a long section that
 * has already scrolled past the viewport top, IO reports it as no longer
 * intersecting, and IO would pick the FOLLOWING section — the classic
 * scroll-spy gotcha CLAUDE.md flags.
 */
export function PartnerApiScrollSpy() {
  useEffect(() => {
    const toc = document.getElementById('pa-toc');
    if (!toc) return;

    const links = Array.from(toc.querySelectorAll('a[href^="#"]')) as HTMLAnchorElement[];
    const sections = links
      .map((a) => document.getElementById(a.getAttribute('href')!.slice(1)))
      .filter((el): el is HTMLElement => !!el);
    const byId = new Map(links.map((a) => [a.getAttribute('href')!.slice(1), a]));

    const setActive = (id: string) => {
      links.forEach((a) => a.classList.remove('pa-active'));
      byId.get(id)?.classList.add('pa-active');
    };
    const onScroll = () => {
      // Read the site's --header-h at run time so a header resize never
      // silently drifts the scroll-spy target.
      const headerH = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--header-h') || '64',
        10,
      );
      const fold = window.scrollY + headerH + 24;
      let currentId = sections[0]?.id;
      for (const s of sections) {
        if (s.offsetTop <= fold) currentId = s.id;
        else break;
      }
      if (currentId) setActive(currentId);
    };

    let raf: number | null = null;
    const handler = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = null; onScroll(); });
    };
    window.addEventListener('scroll', handler, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return null;
}
