'use client';

import type { FormEvent } from 'react';
import type { AllotmentChoiceFull } from '@/core/models';
import { outcomeText, PAN_PATTERN, useAllotmentCheck } from '@/core/allotment';
import { Hero, Icon, Ttl } from './parts';

/* One tile per registrar: the same registrar is spelt several ways across issues, but its allotment page is one address. */
function registrarLinks(choices: AllotmentChoiceFull[], first: AllotmentChoiceFull | undefined) {
  const seen = new Set<string>();
  const out: { name: string; url: string }[] = [];
  const add = (c: AllotmentChoiceFull | undefined) => {
    if (!c || !c.registrarUrl || !c.registrar) return;
    let host = c.registrarUrl;
    try { host = new URL(c.registrarUrl).host.replace(/^www\./, ''); } catch { /* keep */ }
    if (seen.has(host)) return;
    seen.add(host);
    out.push({ name: c.registrar.replace(/\s+(Pvt\.?\s*Ltd\.?|Private Limited|Limited|Ltd\.?)$/i, ''), url: c.registrarUrl });
  };
  add(first);
  choices.forEach(add);
  return out.slice(0, 6);
}

/* "ABCDE1234F" -> "ABCDE****F": enough to recognise, not enough to copy. */
const maskPan = (p: string) => (p.length === 10 ? `${p.slice(0, 5)}****${p.slice(9)}` : p);

export default function AllotmentPage({ choices }: { choices: AllotmentChoiceFull[] }) {
  const a = useAllotmentCheck(choices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };
  const sel = choices.find((c) => c.id === a.ipoId) || choices[0];
  const pan = a.pan.trim().toUpperCase();
  const panState = pan.length === 10 ? (PAN_PATTERN.test(pan) ? 'ok' : 'bad') : '';
  const links = registrarLinks(choices, sel);
  const dates: [string, string][] = sel ? [['IPO closing date', sel.closeD], ['Basis of allotment', sel.allotD], ['Refund initiation', sel.refundD], ['Demat credit', sel.dematD], ['Listing date', sel.listD]] : [];
  const recent = choices.filter((c) => c.allotD).slice(0, 5);
  const first = a.result && a.result.found ? a.result.results[0] : null;

  return (
    <>
      <Hero eyebrow="IPO allotment status" title="Check IPO Allotment Status" sub="Find out whether you were allotted shares in an IPO, using the PAN on your application, once the registrar publishes the basis of allotment." art="clipboard" />
      <div className="b-wrap b-main b-allot">
        <div className="b-allot-main">
          <section className="b-card b-checker" aria-labelledby="ck-h">
            <div className="b-checker-tab"><Icon name="card" size={22} /><h2 id="ck-h">Check with PAN number</h2></div>
            {choices.length ? (
              <form className="b-checker-f" onSubmit={onSubmit}>
                <label className="b-flbl"><span>Select IPO <span aria-hidden="true" className="b-req">*</span></span>
                  <select className="b-field" value={a.ipoId} onChange={(e) => a.setIpoId(e.target.value)}>
                    {choices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.date ? ` — allotment ${c.date}` : ''}</option>)}
                  </select>
                </label>
                <label className="b-flbl"><span>Enter PAN number <span aria-hidden="true" className="b-req">*</span></span>
                  <span className={`b-panbox${panState ? ` ${panState}` : ''}`}>
                    <input className="b-field num" value={a.pan} onChange={(e) => a.setPan(e.target.value)} placeholder="ABCDE1234F" maxLength={10} autoComplete="off" spellCheck={false} aria-describedby="b-pan-hint" />
                    {panState === 'ok' ? <Icon name="tick" size={18} stroke={2.4} /> : null}
                  </span>
                </label>
                <button type="submit" className="b-btn b-btn-p" disabled={a.busy}><Icon name="search" size={18} stroke={2.2} />{a.busy ? 'Checking…' : 'Check allotment'}</button>
                <span id="b-pan-hint" className={`b-pan-hint ${panState}`}>{panState === 'ok' ? 'Valid PAN format' : panState === 'bad' ? 'A PAN is five letters, four digits and a letter' : 'As printed on the PAN card. Sent only to run this lookup.'}</span>
              </form>
            ) : <p className="b-none">No IPO has closed in the last 90 days, so there is nothing to look up yet.</p>}
            <div role="status" aria-live="polite">
              {a.error ? <p className="b-err" role="alert">{a.error}</p> : null}
              {a.result ? outcomeText(a.result).map((o, i) => (
                <div key={i} className={`b-result ${o.tone}`}>
                  <span className="b-result-ic"><Icon name={o.tone === 'open' ? 'tick' : 'info'} size={30} stroke={2.4} /></span>
                  <div className="b-result-t"><span>Allotment status</span><strong>{o.title}</strong><p>{o.body}</p></div>
                  {i === 0 && first ? (
                    <dl className="b-result-d">
                      <div><dt>PAN</dt><dd className="num">{maskPan(pan)}</dd></div>
                      <div><dt>Category</dt><dd>{first.category || '—'}</dd></div>
                      <div><dt>Lots applied</dt><dd className="num">{first.lots || '—'}</dd></div>
                      <div><dt>Shares allotted</dt><dd className="num">{first.allottedShares != null ? first.allottedShares.toLocaleString('en-IN') : first.status === 'not_allotted' ? '0' : '—'}</dd></div>
                    </dl>
                  ) : null}
                </div>
              )) : null}
            </div>
          </section>

          <section className="b-card" aria-labelledby="rg-h">
            <div className="b-card-h"><div><Ttl id="rg-h"><Icon name="link" size={20} />Registrar links</Ttl><p className="b-note">Check allotment directly on the registrar’s own website.</p></div></div>
            {links.length ? (
              <ul className="b-reg">
                {links.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer"><span>{l.name}</span><Icon name="ext" size={17} /></a></li>)}
              </ul>
            ) : <p className="b-none">No registrar links have been entered for recent issues.</p>}
          </section>

          <div className="b-notice"><Icon name="info" size={20} /><b>Important note</b><span>Allotment results come from the registrar’s published file. If anything looks wrong, confirm on the registrar’s own website for that IPO.</span></div>
          <section className="b-card" aria-labelledby="hw-h">
            <div className="b-card-h"><Ttl id="hw-h"><Icon name="info" size={20} />How to check allotment?</Ttl></div>
            <ol className="b-nsteps b-nsteps-row">
              {['Select the IPO from the dropdown.', 'Enter the PAN on the application.', 'Select “Check allotment”.', 'See the registrar’s answer straight away.'].map((s, i) => <li key={s}><span className="num">{i + 1}</span>{s}</li>)}
            </ol>
          </section>
        </div>

        <aside className="b-allot-side">
          {sel ? (
            <section className="b-card" aria-labelledby="dt-h">
              <div className="b-card-h"><div><Ttl id="dt-h"><Icon name="calendar" size={20} />Important dates</Ttl><p className="b-note">{sel.name}</p></div></div>
              <ul className="b-dotlist">{dates.map(([k, v]) => <li key={k}><span>{k}</span><b className="num">{v || '—'}</b></li>)}</ul>
            </section>
          ) : null}
          <section className="b-card" aria-labelledby="ad-h">
            <div className="b-card-h"><Ttl id="ad-h"><Icon name="calendar" size={20} />Recent allotments</Ttl></div>
            {recent.length ? <ul className="b-dotlist">{recent.map((c) => <li key={c.id}><span>{c.name}</span><b className="num">{c.allotD}</b></li>)}</ul> : <p className="b-none">No allotment dates recorded for recent issues.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
