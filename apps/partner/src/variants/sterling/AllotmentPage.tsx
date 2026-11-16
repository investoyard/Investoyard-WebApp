'use client';

import type { FormEvent } from 'react';
import { outcomeText, useAllotmentCheck, type AllotmentCheck, type AllotmentChoice } from '@/core/allotment';

export function AllotmentForm({ choices, compact = false }: { choices: AllotmentChoice[]; compact?: boolean }) {
  const a = useAllotmentCheck(choices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };

  return (
    <div className={compact ? 's-af-wrap' : undefined}>
      <form onSubmit={onSubmit} className={compact ? 's-af' : 's-form'}>
        <label className="s-label s-af-ipo">
          IPO
          <select className="s-field" value={a.ipoId} onChange={(e) => a.setIpoId(e.target.value)} style={{ width: '100%' }}>
            {choices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.date && !compact ? ` — allotment ${c.date}` : ''}</option>)}
          </select>
        </label>
        <label className="s-label s-af-pan">
          PAN
          <input className="s-field num" value={a.pan} onChange={(e) => a.setPan(e.target.value)} placeholder="ABCDE1234F" maxLength={10} autoComplete="off" spellCheck={false} style={{ width: '100%', letterSpacing: '.06em' }} aria-describedby={compact ? undefined : 'pan-help'} />
          {!compact ? <span id="pan-help" style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>As printed on the PAN card</span> : null}
        </label>
        <button type="submit" className="s-btn s-btn-p s-af-go" disabled={a.busy} style={compact ? undefined : { alignSelf: 'flex-start', height: 48 }}>{a.busy ? 'Checking…' : 'Check status'}</button>
      </form>
      {a.error ? <p role="alert" style={{ marginTop: 12, fontSize: 14, color: 'var(--neg)' }}>{a.error}</p> : null}
      {a.result ? <ResultView r={a.result} /> : null}
    </div>
  );
}

function ResultView({ r }: { r: AllotmentCheck }) {
  return (
    <div role="status">
      {outcomeText(r).map((o, i) => (
        <div key={i} className="s-result">
          <h3><span className={`s-dot s-dot-${o.tone}`} />{o.title}</h3>
          <p>{o.body}</p>
        </div>
      ))}
    </div>
  );
}

export default function AllotmentPage({ choices }: { choices: AllotmentChoice[] }) {
  const withDates = choices.filter((c) => c.date).slice(0, 10);
  return (
    <div className="s-wrap s-page">
      <div className="s-two">
        <div style={{ minWidth: 0 }}>
          <h1 className="s-ph1">Check allotment</h1>
          <p className="s-plede">Pick the issue and enter the PAN on the application. It works for any applicant, wherever they applied, once the registrar has published the basis of allotment.</p>
          <AllotmentForm choices={choices} />
          <h2 className="s-h3" style={{ marginTop: 48, fontSize: 20 }}>What the result means</h2>
          <dl style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {[
              ['s-dot-open', 'Allotted', 'Shares reach your demat before listing. Only the allotted amount is debited.'],
              ['s-dot-closed', 'Not allotted', 'The UPI block is released by your bank. Nothing is debited.'],
              ['s-dot-upcoming', 'Not found', 'The registrar has not published yet, or this PAN did not apply in this issue.'],
            ].map(([dot, k, v]) => (
              <div key={k} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 20 }}>
                <dt style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600 }}><span className={`s-dot ${dot}`} />{k}</dt>
                <dd style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' }}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <aside className="s-cal" aria-label="Allotment calendar">
          <h2>Allotment calendar</h2>
          <ul>
            {withDates.map((c) => (
              <li key={c.id}><span style={{ fontWeight: 500 }}>{c.name}</span><span className="num" style={{ color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{c.date}</span></li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
