'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface AsyncOption { value: string; label: string; sub?: string }

/**
 * A server-searched sibling of `SearchSelect`, for lists too big to hold in the
 * browser.
 *
 * WHY IT EXISTS: `SearchSelect` takes every option as a prop and filters in
 * memory, which is right for 170 banks and impossible for ~1.7 lakh bank
 * branches. This keeps that control's portal, keyboard and click-outside
 * behaviour exactly — deliberately the same CSS classes, so there are no new
 * rules to collide in `globals.css` and the two look identical — and replaces
 * only where the options come from.
 *
 * THREE THINGS IT HAS TO GET RIGHT THAT THE IN-MEMORY VERSION NEVER FACED:
 *
 *  1. **A slow early response must not overwrite a fast later one.** Typing
 *     "fort" fires requests for "f", "fo", "for", "fort"; if "fo" answers last
 *     the list shows the wrong results for the text on screen. Every request
 *     carries a sequence number and anything but the newest is discarded, and
 *     the in-flight one is aborted as well.
 *
 *  2. **"Searching" and "no match" are different states.** Rendering an empty
 *     list while a request is open tells the reader their branch does not
 *     exist. Same distinction as the `loaded` flag on /subscription/v2.
 *
 *  3. **The selected label cannot be looked up from the options.** They are
 *     transient — fetched per query and thrown away — so the chosen row's label
 *     is held here and also accepted as `selectedLabel`, which is what lets a
 *     saved profile render "Fort, Mumbai" before any search has run.
 */
export function AsyncSearchSelect({
  value, selectedLabel, onChange, search, placeholder, disabled, minChars = 0, emptyHint, freeText,
}: {
  value: string;
  /** Label for an already-chosen value (e.g. loaded from a saved profile). */
  selectedLabel?: string;
  onChange: (value: string, option: AsyncOption | null) => void;
  /** Resolve options for a query. Receives an AbortSignal — honour it. */
  search: (q: string, signal: AbortSignal) => Promise<AsyncOption[]>;
  placeholder?: string;
  disabled?: boolean;
  /** Below this many characters, don't search at all (0 = search on focus). */
  minChars?: number;
  /** Shown instead of "No match" before anything has been typed. */
  emptyHint?: string;
  /**
   * SUGGEST WITHOUT CONSTRAINING. With this on, the typed text IS the value —
   * every keystroke calls `onChange(text, null)` and the list below is advice,
   * not a gate. The city field needs it because the registrar matches what the
   * applicant’s BANK holds, not what we imported, so a closed list could make
   * a valid application unfillable. Off (the default) the control behaves as a
   * picker, which is right for a bank or a branch: those ARE closed sets and a
   * typed-but-unmatched bank name means nothing to anybody.
   */
  freeText?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [opts, setOpts] = useState<AsyncOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [hl, setHl] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  /** The label of what is currently chosen — see note 3 above. */
  const [label, setLabel] = useState(selectedLabel ?? '');

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);

  /* A parent clearing the value (e.g. the bank changed, so the branch must go)
     has to clear the label too, or the input keeps showing a branch that is no
     longer selected. */
  useEffect(() => { if (!value) setLabel(''); else if (selectedLabel) setLabel(selectedLabel); }, [value, selectedLabel]);

  const run = useCallback((q: string) => {
    const mine = ++seq.current;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    if (q.trim().length < minChars) { setOpts([]); setBusy(false); return; }
    setBusy(true);
    search(q, ac.signal)
      .then((r) => { if (mine === seq.current) { setOpts(r); setBusy(false); } })
      .catch(() => { if (mine === seq.current) { setOpts([]); setBusy(false); } });
  }, [search, minChars]);

  /* Debounced: one query per 250 ms of typing, not one per keystroke. At 1.7
     lakh rows each keystroke is a database query, so this is load, not polish. */
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => run(query), 250);
    return () => clearTimeout(t);
  }, [query, open, run]);

  /* Abort whatever is in flight when the control unmounts or closes. */
  useEffect(() => () => abort.current?.abort(), []);

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

  useEffect(() => {
    const el = listRef.current?.children[hl] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [hl, open]);

  const pick = (o: AsyncOption) => {
    setLabel(o.label);
    onChange(o.value, o);
    setOpen(false);
    setQuery('');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); setHl(0); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(h + 1, opts.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (opts[hl]) pick(opts[hl]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  return (
    <div className="sselect">
      <input
        ref={inputRef}
        className="input"
        value={freeText ? (open ? query : (value || label)) : (open ? query : label)}
        placeholder={label || placeholder || 'Search…'}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => { setOpen(true); setQuery(freeText ? (value ?? '') : ''); setHl(0); run(freeText ? (value ?? '') : ''); }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHl(0);
          /* The keystroke IS the value here — so closing the list without
             picking anything keeps what was typed, rather than reverting. */
          if (freeText) onChange(e.target.value, null);
        }}
        onKeyDown={onKey}
      />
      {open && rect && createPortal(
        <div className="sselect-list" ref={listRef} style={{ top: rect.top, left: rect.left, width: rect.width }}>
          {/* Order matters: searching is reported BEFORE emptiness, so an open
              request never reads as "your branch is not in the directory". */}
          {busy && opts.length === 0 && <div className="sselect-empty">Searching…</div>}
          {!busy && opts.length === 0 && (
            <div className="sselect-empty">
              {query.trim().length < minChars
                ? (emptyHint ?? `Type ${minChars} characters to search.`)
                : (freeText ? 'Not in our list — what you typed will be saved.' : 'No match.')}
            </div>
          )}
          {opts.map((o, i) => (
            <button
              key={o.value}
              type="button"
              className={`sselect-opt${i === hl ? ' hl' : ''}`}
              onMouseEnter={() => setHl(i)}
              // mousedown, not click — fires before the input's blur/outside-close
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
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
