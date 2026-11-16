'use client';

import type { FormEvent } from 'react';
import { outcomeText, useAllotmentCheck, type AllotmentChoice } from '@/core/allotment';

/* A registrar query console: the form on the left, the answer as a log, the calendar beside it. */
export default function AllotmentPage({ choices }: { choices: AllotmentChoice[] }) {
  const a = useAllotmentCheck(choices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };
  return (
    <div className="t-page">
      <div className="t-intro" style={{ marginBottom: 0 }}>
        <div><h1>Allotment lookup</h1><p>Queries the registrar’s file for any applicant, wherever they applied, once the basis of allotment is published.</p></div>
      </div>
      <div className="t-two">
        <section className="t-panel" aria-labelledby="q-h">
          <div className="t-ph"><h2 id="q-h">Query</h2></div>
          <form className="t-pb t-form" onSubmit={onSubmit} style={{ maxWidth: 560 }}>
            <label className="t-label">Issue
              <select className="t-input" style={{ marginTop: 6, textTransform: 'none', letterSpacing: 0 }} value={a.ipoId} onChange={(e) => a.setIpoId(e.target.value)}>
                {choices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.date ? ` — allotment ${c.date}` : ''}</option>)}
              </select>
            </label>
            <label className="t-label">PAN
              <input className="t-input mono" style={{ marginTop: 6, letterSpacing: '.08em' }} value={a.pan} onChange={(e) => a.setPan(e.target.value)} placeholder="ABCDE1234F" maxLength={10} autoComplete="off" spellCheck={false} />
            </label>
            <button type="submit" className="t-btn t-btn-p" disabled={a.busy} style={{ justifySelf: 'start', minWidth: 180 }}>{a.busy ? 'Querying…' : 'Query registrar'}</button>
          </form>
          <div className="t-pb" style={{ borderTop: '1px solid var(--line2)' }} role="status" aria-live="polite">
            <div className="t-label" style={{ marginBottom: 8 }}>Output</div>
            {a.error ? <p className="t-err" role="alert" style={{ marginTop: 0 }}>{a.error}</p> : null}
            {a.result ? outcomeText(a.result).map((o, i) => (
              <p key={i} className="mono" style={{ fontSize: 13, lineHeight: 1.7 }}>
                <span className={`t-st ${o.tone}`}><i aria-hidden="true" />{o.title}</span><br /><span className="t-muted" style={{ fontFamily: 'var(--font-term-sans)' }}>{o.body}</span>
              </p>
            )) : !a.error ? <p className="t-muted mono" style={{ fontSize: 13 }}>— awaiting query —</p> : null}
          </div>
        </section>
        <aside className="t-panel" aria-labelledby="cal-h">
          <div className="t-ph"><h2 id="cal-h">Allotment calendar</h2></div>
          <dl className="t-dl">
            {choices.filter((c) => c.date).slice(0, 14).map((c) => <div key={c.id}><dt style={{ color: 'var(--ink)' }}>{c.name}</dt><dd className="mono t-muted">{c.date}</dd></div>)}
          </dl>
        </aside>
      </div>
    </div>
  );
}
