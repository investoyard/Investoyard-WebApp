'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';

/**
 * A three-dot overflow menu for table-row actions. Children are the menu items.
 * The popover is position:fixed (anchored to the button on open) so it can never
 * be clipped by a card's overflow-x scroll container.
 */
export function RowMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    window.addEventListener('scroll', close, true); // any scroll → close (anchor would drift)
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuW = 180;
      setPos({
        top: Math.min(r.bottom + 4, window.innerHeight - 60),
        left: Math.max(8, Math.min(r.right - menuW, window.innerWidth - menuW - 8)),
      });
    }
    setOpen((o) => !o);
  };

  return (
    <span className="rowmenu" onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} type="button" className="icon-btn" onClick={toggle} aria-label="More actions"><Icon name="dots" size={16} /></button>
      {open && pos && (
        <div className="rowmenu-pop" style={{ position: 'fixed', top: pos.top, left: pos.left, right: 'auto', zIndex: 1000 }} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </span>
  );
}
