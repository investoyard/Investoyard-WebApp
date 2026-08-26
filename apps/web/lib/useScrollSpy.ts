'use client';
import { useEffect, useState } from 'react';

/**
 * Scroll a section under a sticky filter bar.
 *
 * Native anchor jumps land in the wrong place here: the scrollport is already
 * inset by `html { scroll-padding-top }` AND the target carries its own
 * `scroll-margin-top`, and the two ADD — which parked headings 137px below the
 * bar with the previous section still on screen. Measuring the bar at click
 * time is both exact and immune to the bar changing height later.
 */
/**
 * Keep the active chip visible inside its own horizontal strip.
 *
 * NOT scrollIntoView: `block: 'nearest'` scrolls the nearest scrollable
 * ancestor in the VERTICAL axis too — the page — so while a chip-click smooth
 * scroll was animating, every spy update yanked the page and the jump ended
 * somewhere else entirely. Setting scrollLeft touches the strip and nothing
 * else, so it can never interfere with a scroll in flight.
 */
export function keepChipInView(strip: HTMLElement | null, id: string, pad = 12) {
  const chip = strip?.querySelector<HTMLElement>(`[data-chip="${id}"]`);
  if (!strip || !chip) return;
  const c = chip.getBoundingClientRect();
  const s = strip.getBoundingClientRect();
  if (c.left < s.left) strip.scrollLeft -= (s.left - c.left) + pad;
  else if (c.right > s.right) strip.scrollLeft += (c.right - s.right) + pad;
}

export function scrollToSection(id: string, bar: HTMLElement | null, gap = 12) {
  const el = document.getElementById(id);
  if (!el) return;
  // The bar's CURRENT rect is wrong whenever it hasn't stuck yet (near the top
  // of the page it still sits in normal flow, far lower), which under-scrolls
  // and leaves the heading stranded mid-screen. Its STUCK bottom is simply its
  // sticky `top` offset plus its own height, wherever the page happens to be.
  const stuckBottom = bar ? (parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight : 0;
  const top = window.scrollY + el.getBoundingClientRect().top - stuckBottom - gap;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  history.replaceState(null, '', `#${id}`);
}

/**
 * Which section is currently being read — for highlighting a chip in a sticky
 * filter bar.
 *
 * Deliberately NOT an IntersectionObserver: sections here are much taller than
 * any sensible observation band, so several are "intersecting" at once and the
 * topmost one is the section you have already scrolled PAST, not the one you
 * are in. Reading positions directly is both correct and easier to reason
 * about — the answer is simply the last heading above the reading line.
 *
 * @param ids     section element ids, in document order
 * @param enabled pass false to freeze (e.g. while a search filters the list)
 * @param line    viewport y-offset that counts as "the top of the reading area";
 *                should clear the sticky header + filter bar
 */
export function useScrollSpy(ids: string[], enabled = true, line = 200) {
  const [active, setActive] = useState(ids[0] ?? '');

  useEffect(() => {
    if (!enabled || ids.length === 0) return;
    const measure = () => {
      let cur = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) cur = id;
      }
      setActive(cur);
    };
    // Throttled on a timestamp rather than requestAnimationFrame: rAF is
    // suspended whenever the page isn't compositing (background tab), which
    // would silently freeze the highlight. A handful of rect reads at ~30/sec
    // costs nothing and always runs.
    let last = 0;
    const onScroll = () => {
      const now = Date.now();
      if (now - last < 32) return;
      last = now;
      measure();
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ids.join(','), enabled, line]); // eslint-disable-line react-hooks/exhaustive-deps

  // the setter lets a chip click claim the highlight immediately, instead of
  // waiting for the smooth scroll to emit its first scroll event
  return [active, setActive] as const;
}
