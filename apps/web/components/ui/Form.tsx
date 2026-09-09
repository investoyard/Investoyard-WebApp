'use client';
import { Children, isValidElement, useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';

/** Password input with a show/hide eye toggle. */
export function PasswordInput({ value, onChange, placeholder, id, autoFocus, onKeyDown, mono = true }: {
  value: string; onChange: (v: string) => void; placeholder?: string; id?: string;
  autoFocus?: boolean; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void; mono?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input id={id} className={`input${mono ? ' mono' : ''}`} type={show ? 'text' : 'password'} value={value}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} onKeyDown={onKeyDown} autoComplete="off" />
      <button type="button" className="pw-toggle" tabIndex={-1} onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        <Icon name={show ? 'eye-off' : 'eye'} size={17} />
      </button>
    </div>
  );
}

/** Page header with title, optional subtitle/back-link and right-aligned actions. */
export function PageHead({ title, sub, back, actions }: { title: string; sub?: string; back?: { href: string; label: string }; actions?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {back && <a href={back.href} className="back"><Icon name="arrow-right" size={14} style={{ transform: 'rotate(180deg)' }} /> {back.label}</a>}
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/** A card panel with an underline-accent section title — the reference form layout. */
export function Panel({ title, desc, actions, children }: { title: string; desc?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card form-panel">
      <div className="fp-head">
        <div><span className="t">{title}</span>{desc && <span className="d">{desc}</span>}</div>
        {actions && <div className="fp-actions">{actions}</div>}
      </div>
      <div className="fp-body">{children}</div>
    </div>
  );
}

/** A numbered form section with heading + description. */
export function Section({ n, title, desc, children }: { n?: number | string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="form-section">
      <div className="fs-head">
        <div className="t">{n != null && <span className="n">{n}</span>}{title}</div>
        {desc && <div className="d">{desc}</div>}
      </div>
      <div className="form-grid">{children}</div>
    </div>
  );
}

/** A labelled field. `span` widens it across grid columns; `full` spans the row.
 *
 *  Pending-field highlight (operator ask 2026-09-09):
 *    - `required` + empty → `pending-mandatory` (pastel amber tint)
 *    - not required + empty → `pending-optional` (pastel gray-blue tint)
 *    - filled → neutral
 *
 *  The empty check runs against `value` when the caller passes it explicitly,
 *  otherwise Field auto-detects by walking `children` for the first element
 *  carrying a `value` prop (input / select / textarea / SearchSelect / custom
 *  widgets). Booleans (Toggle `on`) are skipped — "off" is a legitimate state,
 *  not "empty". Explicitly passing `value={'n/a'}` from the caller bypasses
 *  auto-detect for a field where the child's value shouldn't drive the tint
 *  (e.g. a disabled max-price field on a fixed-price issue).
 *
 *  "Empty" = null / undefined / '' / empty array. */
export function Field({ label, required, hint, span, full, value, children }: {
  label: string; required?: boolean; hint?: string; span?: 2 | 3; full?: boolean;
  value?: any; children: ReactNode;
}) {
  const detected = value !== undefined ? { has: true, v: value } : findValue(children);
  const hasValue = detected.has
    && detected.v != null && detected.v !== ''
    && !(Array.isArray(detected.v) && detected.v.length === 0);
  const pending = detected.has && !hasValue
    ? (required ? 'pending-mandatory' : 'pending-optional')
    : '';
  const cls = ['field', pending, full ? 'full' : span === 3 ? 'col-3' : span === 2 ? 'col-2' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <label>{label}{required && <span className="req">*</span>}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/** Walk children for the first React element carrying a string/number/array
 *  `value` (or empty string). Booleans are skipped — a Toggle's `on` prop is
 *  state, not "pending". Recurses one level into wrapper divs so a Toggle
 *  wrapped in a spacer doesn't hide its child's value from us. */
function findValue(node: ReactNode, depth = 0): { has: boolean; v?: any } {
  if (depth > 4) return { has: false };
  const kids = Children.toArray(node);
  for (const c of kids) {
    if (!isValidElement(c)) continue;
    const props: any = (c as any).props;
    if (props && 'value' in props) {
      const v = props.value;
      if (typeof v !== 'boolean') return { has: true, v };
    }
    if (props?.children != null) {
      const inner = findValue(props.children, depth + 1);
      if (inner.has) return inner;
    }
  }
  return { has: false };
}

/** Segmented control for a small set of choices. */
export function Segmented({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function FormActions({ children }: { children: React.ReactNode }) {
  return <div className="form-actions">{children}</div>;
}

/** An on/off toggle switch. */
export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled}
      className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <span className="knob" />
    </button>
  );
}

/** A search input with a leading icon. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="search">
      <Icon name="sparkle" size={15} />
      <input className="input" style={{ minWidth: 240 }} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? 'Search…'} />
    </div>
  );
}
