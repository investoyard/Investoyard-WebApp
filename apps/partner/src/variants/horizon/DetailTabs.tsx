'use client';

import { useEffect, useState } from 'react';

/*
 * The IPO page's section tabs: pinned under the header while the page
 * scrolls, with the section being read marked. Positions are read directly
 * on scroll (coalesced to one read per 100ms) rather than with an
 * IntersectionObserver, which picks the topmost *intersecting* section — for
 * tall sections the one already scrolled past. The cards sit in three
 * columns, so "the section being read" is the one whose top most recently
 * passed under the bar, whichever column it is in.
 */
export default function DetailTabs({ tabs }: { tabs: [string, string][] }) {
  const [active, setActive] = useState(tabs[0]?.[0] || '');

  useEffect(() => {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      last = Date.now();
      const bar = document.querySelector('.h-dtabs-bar');
      const line = (bar ? bar.getBoundingClientRect().bottom : 120) + 24;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const tops = tabs
        .map(([id]) => ({ id, top: document.getElementById(id)?.getBoundingClientRect().top ?? Infinity }))
        .filter((t) => Number.isFinite(t.top));
      if (!tops.length) return;
      if (atEnd) { setActive(tops.reduce((a, b) => (b.top > a.top ? b : a)).id); return; }
      const passed = tops.filter((t) => t.top <= line);
      setActive(passed.length ? passed.reduce((a, b) => (b.top > a.top ? b : a)).id : tabs[0][0]);
    };
    const onScroll = () => {
      if (Date.now() - last > 100) read();
      else if (!timer) timer = setTimeout(() => { timer = null; read(); }, 110);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [tabs]);

  return (
    <nav className="h-dtabs-bar" aria-label="Sections">
      <div className="h-wrap">
        <div className="h-dtabs">
          {tabs.map(([id, l]) => (
            <a key={id} href={`#${id}`} aria-current={active === id ? 'true' : undefined} onClick={() => setActive(id)}>{l}</a>
          ))}
        </div>
      </div>
    </nav>
  );
}
