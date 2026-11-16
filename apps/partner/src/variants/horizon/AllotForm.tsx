'use client';

import type { FormEvent } from 'react';
import { outcomeText, type AllotmentChoice, type useAllotmentCheck } from '@/core/allotment';

/* The allotment form, shared by the home band and the allotment page. */
export default function AllotForm({ a, choices, onSubmit }: { a: ReturnType<typeof useAllotmentCheck>; choices: AllotmentChoice[]; onSubmit: (e: FormEvent) => void }) {
  return (
    <form className="h-card-form" onSubmit={onSubmit}>
      <label className="h-lbl">IPO
        <select className="h-field" value={a.ipoId} onChange={(e) => a.setIpoId(e.target.value)}>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.date ? ` — allotment ${c.date}` : ''}</option>)}
        </select>
      </label>
      <label className="h-lbl">PAN
        <input className="h-field h-pan num" value={a.pan} onChange={(e) => a.setPan(e.target.value)} placeholder="ABCDE1234F" maxLength={10} autoComplete="off" spellCheck={false} />
      </label>
      <button type="submit" className="h-btn h-btn-p" disabled={a.busy}>{a.busy ? 'Checking…' : 'Check allotment'}</button>
      <div role="status" aria-live="polite">
        {a.error ? <p className="h-err" role="alert">{a.error}</p> : null}
        {a.result ? outcomeText(a.result).map((o, i) => (
          <div key={i} className={`h-out ${o.tone}`} style={{ marginTop: i ? 10 : 0 }}><strong>{o.title}</strong><p>{o.body}</p></div>
        )) : null}
      </div>
    </form>
  );
}

