'use client';

import type { FormEvent } from 'react';
import { outcomeText, type AllotmentChoice, type useAllotmentCheck } from '@/core/allotment';

/* The allotment form, shared by the home page and the allotment page. */
export default function AllotForm({ a, choices, onSubmit }: { a: ReturnType<typeof useAllotmentCheck>; choices: AllotmentChoice[]; onSubmit: (e: FormEvent) => void }) {
  return (
    <form className="l-form" onSubmit={onSubmit}>
      <label className="l-field-l">IPO
        <select className="l-field" value={a.ipoId} onChange={(e) => a.setIpoId(e.target.value)}>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.date ? ` — allotment ${c.date}` : ''}</option>)}
        </select>
      </label>
      <label className="l-field-l">PAN
        <input className="l-field num" value={a.pan} onChange={(e) => a.setPan(e.target.value)} placeholder="ABCDE1234F" maxLength={10} autoComplete="off" spellCheck={false} style={{ letterSpacing: '.08em', textTransform: 'uppercase' }} />
      </label>
      <div><button type="submit" className="l-btn" disabled={a.busy}>{a.busy ? 'Checking…' : 'Check allotment'}</button></div>
      <div role="status" aria-live="polite" style={{ display: 'grid', gap: 10 }}>
        {a.error ? <p className="l-err" role="alert">{a.error}</p> : null}
        {a.result ? outcomeText(a.result).map((o, i) => <div key={i} className={`l-out ${o.tone}`}><strong>{o.title}</strong><p>{o.body}</p></div>) : null}
      </div>
    </form>
  );
}
