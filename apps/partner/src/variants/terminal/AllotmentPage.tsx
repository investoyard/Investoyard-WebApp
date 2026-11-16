'use client';

import type { FormEvent } from 'react';
import { outcomeText, useAllotmentCheck, type AllotmentChoice } from '@/core/allotment';

export default function AllotmentPage({ choices }: { choices: AllotmentChoice[] }) {
  const a = useAllotmentCheck(choices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };
  const dated = choices.filter((c) => c.date).slice(0, 12);
  return (
    <div className="t-page">
      <div className="t-intro"><div><h1>Allotment status</h1><p>Checks the registrar’s file for any applicant, wherever they applied, once the basis of allotment is published.</p></div></div>
      <div className="t-lower t-lower-wide">
        <section className="t-panel" aria-labelledby="q-h">
          <div className="t-ph"><h2 id="q-h">Look up an application</h2></div>
          {choices.length ? (
            <form className="t-pb t-form" onSubmit={onSubmit} style={{ maxWidth: 560 }}>
              <label className="t-label">IPO
                <select className="t-input" value={a.ipoId} onChange={(e) => a.setIpoId(e.target.value)}>
                  {choices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.date ? ` — allotment ${c.date}` : ''}</option>)}
                </select>
              </label>
              <label className="t-label">PAN
                <input className="t-input num" value={a.pan} onChange={(e) => a.setPan(e.target.value)} placeholder="ABCDE1234F" maxLength={10} autoComplete="off" spellCheck={false} style={{ letterSpacing: '.06em', textTransform: 'uppercase' }} />
              </label>
              <button type="submit" className="t-btn t-btn-p" disabled={a.busy} style={{ height: 42, justifySelf: 'start', minWidth: 200 }}>{a.busy ? 'Checking…' : 'Check allotment'}</button>
              <div role="status" aria-live="polite" style={{ display: 'grid', gap: 8 }}>
                {a.error ? <p className="t-err" role="alert">{a.error}</p> : null}
                {a.result ? outcomeText(a.result).map((o, i) => <div key={i} className={`t-out ${o.tone}`}><strong>{o.title}</strong><p>{o.body}</p></div>) : null}
              </div>
              <p className="t-muted" style={{ fontSize: 12.5 }}>Your PAN is sent only to run this lookup.</p>
            </form>
          ) : <div className="t-empty">No IPO has closed in the last 90 days, so there is nothing to look up yet.</div>}
        </section>
        <aside className="t-panel" aria-labelledby="cal-h">
          <div className="t-ph"><h2 id="cal-h">Allotment calendar</h2></div>
          {dated.length ? (
            <dl className="t-dl">{dated.map((c) => <div key={c.id}><dt style={{ color: 'var(--ink)' }}>{c.name}</dt><dd className="t-muted">{c.date}</dd></div>)}</dl>
          ) : <div className="t-empty" style={{ padding: 28 }}>No allotment dates recorded.</div>}
        </aside>
      </div>
    </div>
  );
}
