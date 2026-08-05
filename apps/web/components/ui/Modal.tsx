'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Centered modal for small forms. Rendered via a portal to <body> so it is never
 * clipped by a transformed/animated ancestor (e.g. the admin-main entrance animation).
 * Closes on overlay click or Escape; the panel scrolls internally when tall.
 */
export function Modal({ title, sub, onClose, children, wide }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  if (!mounted) return null;

  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={wide ? { width: 'min(680px, 100%)' } : undefined} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0 }}>{title}</h3>
            {sub && <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>{sub}</div>}
          </div>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
