'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';

/**
 * Three-dot overflow menu for table-row actions.
 *
 * The popover is PORTALLED to document.body so no ancestor's overflow
 * (the table's own `overflow-x: auto` in particular) can clip it or push
 * a stray scrollbar when it renders. Position is fixed and clamped tight
 * to the viewport, so opening a menu never scrolls the page and never
 * gets hidden behind a scrollbar.
 *
 * A previous version rendered the popover in-place with `position: fixed`
 * but as a child of the button's table cell. Browsers would occasionally
 * still paint a horizontal scrollbar on the table's overflow container
 * during the open transition — and then closing on any scroll (a defence
 * against the button-anchor drifting) turned "scroll to see the menu"
 * into "menu disappears the moment you scroll". Portalling removes both
 * problems together.
 */
export function RowMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  /**
   * Close on any click OUTSIDE the popover or the button that opens it.
   * Uses `mousedown` (not `click`) so a click on the button that opens
   * this instance can't in the same tick reach a document-level `click`
   * handler and instantly close it — mousedown fires before click.
   */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (btnRef.current?.contains(t)) return;   // clicking our own button toggles via the button's own handler
      if (popRef.current?.contains(t)) return;   // click inside the popover — leave it open, the item handles it
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /**
   * Reposition on scroll/resize instead of closing. Fixed-position menus
   * would otherwise drift away from the button; closing was the old
   * escape hatch. Reposition keeps the menu anchored to the button so a
   * user who scrolls the underlying table doesn't lose their action.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (!btnRef.current) return;
      setPos(clampToViewport(btnRef.current.getBoundingClientRect()));
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const toggle = () => setOpen((o) => !o);

  return (
    <span className="rowmenu">
      <button ref={btnRef} type="button" className="icon-btn" onClick={toggle} aria-label="More actions">
        <Icon name="dots" size={16} />
      </button>
      {mounted && open && pos && createPortal(
        <div
          ref={popRef}
          className="rowmenu-pop"
          style={{ position: 'fixed', top: pos.top, left: pos.left, right: 'auto', zIndex: 1000 }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>,
        document.body,
      )}
    </span>
  );
}

/** Position the popover under the button, clamped so it can never render
 *  off-screen (right edge, bottom edge, small viewports). */
function clampToViewport(r: DOMRect): { top: number; left: number } {
  const MENU_W = 200;
  const MENU_H = 240;
  const M = 8;
  const top = Math.max(M, Math.min(r.bottom + 4, window.innerHeight - MENU_H - M));
  const left = Math.max(M, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - M));
  return { top, left };
}
