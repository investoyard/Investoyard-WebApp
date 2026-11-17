'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import type { AllotmentChoiceFull } from '@/core/models';
import { outcomeText, useAllotmentCheck } from '@/core/allotment';
import { BoardTag, Hero, Icon, Logo } from './parts';

export default function AllotmentPage({ choices }: { choices: AllotmentChoiceFull[] }) {
  const a = useAllotmentCheck(choices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };
  const recent = choices.filter((c) => c.date).slice(0, 3);
  return (
    <>
      <Hero eyebrow="IPO allotment checker" title="Check your" accent="IPO allotment" after=" status" sub="Find out whether you were allotted shares in an IPO. Checks the registrar’s file using your PAN, wherever you applied." />
      <div className="p-wrap p-main">
        <section className="p-card p-checker" style={{ position: 'relative', zIndex: 2, marginTop: -46 }} aria-labelledby="ck-h">
          <div className="p-checker-h">
            <span className="p-tile"><Icon name="check" size={26} /></span>
            <div><h2 id="ck-h">IPO allotment status checker</h2><p>Select the IPO and enter your PAN. Your PAN is sent only to run this lookup.</p></div>
          </div>
          {choices.length ? (
            <form className="p-form" onSubmit={onSubmit}>
              <label className="p-field-l">Select IPO <span className="sr">(required)</span>
                <select className="p-field" value={a.ipoId} onChange={(e) => a.setIpoId(e.target.value)}>
                  {choices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.date ? ` — allotment ${c.date}` : ''}</option>)}
                </select>
              </label>
              <label className="p-field-l">Enter PAN
                <input className="p-field num" value={a.pan} onChange={(e) => a.setPan(e.target.value)} placeholder="ABCDE1234F" maxLength={10} autoComplete="off" spellCheck={false} style={{ letterSpacing: '.08em', textTransform: 'uppercase' }} />
              </label>
              <button type="submit" className="p-btn" disabled={a.busy}><Icon name="search" size={18} stroke={2.2} />{a.busy ? 'Checking…' : 'Check allotment'}</button>
            </form>
          ) : <p className="p-muted">No IPO has closed in the last 90 days, so there is nothing to look up yet.</p>}
          <div role="status" aria-live="polite">
            {a.error ? <p className="p-err" role="alert">{a.error}</p> : null}
            {a.result ? (
              <div className="p-results">
                {outcomeText(a.result).map((o, i) => (
                  <div key={i} className={`p-result ${o.tone}`}>
                    <div className="p-result-h">
                      <span className={`p-tile ${o.tone === 'open' ? 'pos' : o.tone === 'upcoming' ? 'amber' : ''}`}><Icon name={o.tone === 'open' ? 'tick' : o.tone === 'upcoming' ? 'hourglass' : 'info'} size={24} stroke={2.4} /></span>
                      <div><strong>{o.title}</strong><p>{o.body}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <div className="p-row2 p-row2-allot" style={{ marginTop: 22 }}>
          <section className="p-card p-card-pad" aria-labelledby="how-h">
            <div className="p-card-h"><h2 id="how-h"><Icon name="info" size={22} />How to check IPO allotment</h2></div>
            <ol className="p-steps">
              <li><span>1</span>Select the IPO you applied for from the list.</li>
              <li><span>2</span>Enter the PAN the application was made under.</li>
              <li><span>3</span>Select “Check allotment”.</li>
              <li><span>4</span>The registrar’s answer appears straight away, once it has published the basis of allotment.</li>
            </ol>
          </section>
          <section className="p-card p-card-pad" aria-labelledby="rc-h">
            <div className="p-card-h"><h2 id="rc-h"><Icon name="calendar" size={22} />Recent allotments</h2><Link className="p-btn p-btn-q p-btn-sm" href="/ipos/">View all IPOs <Icon name="arrow" size={15} /></Link></div>
            {recent.length ? (
              <div className="p-row3" style={{ gap: 14 }}>
                {recent.map((c) => (
                  <div key={c.id} className="p-card p-mini" style={{ boxShadow: 'none' }}>
                    <div className="p-mini-top"><Logo ipo={c} /><div style={{ minWidth: 0 }}><div className="p-mini-name">{c.name}</div><div style={{ marginTop: 6 }}><BoardTag board={c.board} /></div></div></div>
                    <div className="p-mini-figs">
                      <div>Allotment date<b>{c.date}</b></div>
                      <div>Registrar<b>{c.registrar || '—'}</b></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="p-muted">No allotment dates recorded for recent issues.</p>}
          </section>
        </div>
      </div>
    </>
  );
}
