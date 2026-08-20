'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SearchOption { value: string; label: string; sub?: string }

/**
 * Searchable combobox styled like `.input` — type to filter, ↑/↓ + Enter to pick,
 * Esc / click-outside to close. The option list renders through a portal on
 * document.body (fixed, positioned off the input rect) so it can never be
 * clipped by a card's `overflow: hidden` or trapped in a stacking context.
 */
export function SearchSelect({ options, value, onChange, placeholder, disabled }: {
  options: SearchOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hl, setHl] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q));
  }, [options, query]);

  // anchor the portal list to the input; follow scroll/resize while open
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open]);

  // close on click outside (the list lives in a portal — check both nodes)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!inputRef.current?.contains(t) && !listRef.current?.contains(t)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // keep the highlighted option scrolled into view
  useEffect(() => {
    const el = listRef.current?.children[hl] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [hl, open]);

  const pick = (v: string) => { onChange(v); setOpen(false); setQuery(''); };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); setHl(0); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[hl]) pick(filtered[hl].value); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  return (
    <div className="sselect">
      <input
        ref={inputRef}
        className="input"
        value={open ? query : (selected?.label ?? '')}
        placeholder={selected?.label ?? placeholder ?? 'Search…'}
        disabled={disabled}
        onFocus={() => { setOpen(true); setQuery(''); setHl(Math.max(0, options.findIndex((o) => o.value === value))); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHl(0); }}
        onKeyDown={onKey}
      />
      {open && rect && createPortal(
        <div className="sselect-list" ref={listRef} style={{ top: rect.top, left: rect.left, width: rect.width }}>
          {filtered.length === 0 ? (
            <div className="sselect-empty">No match.</div>
          ) : filtered.map((o, i) => (
            <button
              key={o.value}
              type="button"
              className={`sselect-opt${i === hl ? ' hl' : ''}`}
              onMouseEnter={() => setHl(i)}
              // mousedown, not click — fires before the input's blur/outside-close
              onMouseDown={(e) => { e.preventDefault(); pick(o.value); }}
            >
              {o.label}
              {o.sub && <span className="sub">{o.sub}</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
