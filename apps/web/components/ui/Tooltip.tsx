'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Hover / focus / tap tooltip rendered through a PORTAL.
 *
 * The portal is not a nicety here: `.ipocard` is `overflow: hidden` (it has to
 * be — the rounded corners clip the radial wash and the left rail), so a
 * tooltip positioned inside a card would be sliced off at the card edge. Same
 * reason SearchSelect portals its list out of the admin `.card`.
 *
 * `render` is a FUNCTION, not a node: a list page mounts sixteen of these and
 * none of them should build their contents — a subscription table each — on
 * first paint. It runs only while the tooltip is open.
 *
 * Tap works as well as hover: the trigger is focusable, and a click toggles,
 * so the tooltip is reachable on a phone and from the keyboard. It closes on
 * Escape and on blur.
 *
 * A scroll REPOSITIONS it rather than closing it. Closing looked like the
 * cheap option and is wrong: `HTMLElement.focus()` scrolls its target into
 * view, so tabbing to a trigger that is off-screen opened the tooltip and the
 * scroll that very focus caused dismissed it again in the same tick. It only
 * closes when the trigger itself leaves the viewport.
 */
export function Tooltip({ render, children, className, label, gap = 8 }: {
  render: () => ReactNode;
  children: ReactNode;
  className?: string;
  /** Accessible name for the trigger when its own text isn't the whole story. */
  label?: string;
  /** Distance between trigger and popover, px. */
  gap?: number;
}) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; place: 'top' | 'bottom' } | null>(null);
  // Portals need a DOM; the static export renders this on the server first.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const place = useRef(() => {});
  place.current = () => {
    if (!ref.current || !popRef.current) return;
    const t = ref.current.getBoundingClientRect();
    // Trigger scrolled out of sight — nothing left to point at.
    if (t.bottom < 0 || t.top > window.innerHeight) { setOpen(false); return; }
    const p = popRef.current.getBoundingClientRect();
    const below = t.bottom + gap + p.height <= window.innerHeight - 8;
    const left = Math.max(8, Math.min(
      t.left + t.width / 2 - p.width / 2,
      window.innerWidth - p.width - 8,
    ));
    setPos({ top: below ? t.bottom + gap : t.top - gap - p.height, left, place: below ? 'bottom' : 'top' });
  };

  // Measure AFTER the popover is in the DOM but BEFORE paint, so it never
  // appears at the off-screen parking position it is measured at.
  useLayoutEffect(() => { if (open) place.current(); }, [open]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    // Coalesce a burst of scroll events into one measure per frame.
    const track = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; place.current(); });
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // capture:true — the page is not the only thing that scrolls.
    window.addEventListener('scroll', track, true);
    window.addEventListener('resize', track);
    window.addEventListener('keydown', esc);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', track, true);
      window.removeEventListener('resize', track);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const show = () => setOpen(true);
  const hide = () => { setOpen(false); setPos(null); };

  return (
    <>
      <span
        ref={ref}
        className={className}
        tabIndex={0}
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
      >
        {children}
      </span>
      {mounted && open && createPortal(
        <div
          ref={popRef}
          id={id}
          role="tooltip"
          className={`tt-pop${pos ? ` tt-${pos.place}` : ''}`}
          style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999, visibility: 'hidden' }}
        >
          {render()}
        </div>,
        document.body,
      )}
    </>
  );
}
