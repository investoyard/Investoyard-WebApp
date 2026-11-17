'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { outcomeText, useAllotmentCheck, type AllotmentChoice } from '@/core/allotment';
import { Chip } from './parts';

export default function AllotmentPage({ choices }: { choices: AllotmentChoice[] }) {
  const a = useAllotmentCheck(choices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };
  const cal = choices.filter((c) => c.date).slice(0, 10);

  return (
    <div className="b-page">
      <section className="b-ph">
        <h1 className="disp">Check allotment</h1>
        <p>Pick the issue and enter the PAN on the application. It works for any applicant, wherever they applied, once the registrar has published.</p>
      </section>
      <div className="b-allot-page">
        <section className="b-tile">
          <form className="b-form b-form-lg" onSubmit={onSubmit} style={{ marginTop: 0 }}>
            <label className="b-lbl">IPO
              <select className="b-field" value={a.ipoId} onChange={(e) => a.setIpoId(e.target.value)}>
                {choices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.date ? ` — allotment ${c.date}` : ''}</option>)}
              </select>
            </label>
            <label className="b-lbl">PAN
              <input className="b-field num" value={a.pan} onChange={(e) => a.setPan(e.target.value)} placeholder="ABCDE1234F" maxLength={10} autoComplete="off" spellCheck={false} style={{ letterSpacing: '.08em' }} />
              <span style={{ fontWeight: 400, color: 'var(--muted)' }}>As printed on the PAN card</span>
            </label>
            <button type="submit" className="b-btn b-btn-p" disabled={a.busy}>{a.busy ? 'Checking…' : 'Check status'}</button>
          </form>
          {a.error ? <p role="alert" className="b-err">{a.error}</p> : null}
          {a.result ? outcomeText(a.result).map((o, i) => (
            <div key={i} className="b-out" role="status"><strong><Chip tone={o.tone}>{o.title}</Chip></strong><p>{o.body}</p></div>
          )) : null}
          <h2 className="b-h3 disp" style={{ marginTop: 28 }}>What the result means</h2>
          <div className="b-facts" style={{ marginTop: 12 }}>
            <div><dt><Chip tone="open">Allotted</Chip></dt><dd style={{ fontWeight: 400, color: 'var(--ink2)' }}>Shares reach your demat before listing.</dd></div>
            <div><dt><Chip tone="closed">Not allotted</Chip></dt><dd style={{ fontWeight: 400, color: 'var(--ink2)' }}>The UPI block is released. Nothing is debited.</dd></div>
            <div><dt><Chip tone="upcoming">Not found</Chip></dt><dd style={{ fontWeight: 400, color: 'var(--ink2)' }}>Not published yet, or this PAN did not apply.</dd></div>
          </div>
        </section>
        <aside className="b-tile" aria-label="Allotment calendar">
          <h2 className="b-h3 disp" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>Allotment calendar <Link className="b-link" href="/calendar/" style={{ fontSize: 14, fontFamily: 'var(--font-bento-body)', letterSpacing: 0 }}>Full calendar</Link></h2>
          <ul className="b-cal">
            {cal.map((c) => <li key={c.id}><span style={{ fontWeight: 600 }}>{c.name}</span><span className="num" style={{ color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{c.date}</span></li>)}
          </ul>
        </aside>
      </div>
    </div>
  );
}
