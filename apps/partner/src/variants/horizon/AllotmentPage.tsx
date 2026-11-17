'use client';

import type { FormEvent } from 'react';
import type { AllotmentChoiceFull } from '@/core/models';
import { outcomeText, PAN_PATTERN, useAllotmentCheck } from '@/core/allotment';
import { ExtIcon, Hero, Icon } from './parts';

const FAQ: [string, string][] = [
  ['When is the allotment result available?', 'Once the registrar publishes the basis of allotment, usually the working day after the issue closes. Until then a lookup returns no record.'],
  ['Can I check without my application number?', 'Yes. This check uses the PAN the application was made under, wherever you applied — broker, bank or app.'],
  ['What happens if I do not get an allotment?', 'Nothing is debited. The amount blocked in your bank account through the UPI mandate is released.'],
  ['When do allotted shares reach my demat account?', 'Before listing day, on the demat credit date shown for the issue.'],
  ['Where is the registrar’s own page?', 'Each issue’s registrar runs its own allotment page; the ones we hold are linked on this page.'],
];

/* One link per registrar: the same registrar is spelt several ways across issues, but its allotment page is one address. */
function registrarLinks(choices: AllotmentChoiceFull[], first: AllotmentChoiceFull | undefined) {
  const seen = new Set<string>();
  const out: { name: string; url: string }[] = [];
  const add = (c: AllotmentChoiceFull | undefined) => {
    if (!c || !c.registrarUrl || !c.registrar) return;
    let host = c.registrarUrl;
    try { host = new URL(c.registrarUrl).host.replace(/^www\./, ''); } catch { /* keep the string */ }
    if (seen.has(host)) return;
    seen.add(host);
    out.push({ name: c.registrar, url: c.registrarUrl });
  };
  add(first);
  choices.forEach(add);
  return out.slice(0, 6);
}

export default function AllotmentPage({ choices }: { choices: AllotmentChoiceFull[] }) {
  const a = useAllotmentCheck(choices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };
  const sel = choices.find((c) => c.id === a.ipoId) || choices[0];
  const pan = a.pan.trim().toUpperCase();
  const panState = pan.length === 10 ? (PAN_PATTERN.test(pan) ? 'ok' : 'bad') : '';
  const dates: [string, string][] = sel ? [['IPO closing date', sel.closeD], ['Basis of allotment', sel.allotD], ['Refund initiation', sel.refundD], ['Credit of shares to demat', sel.dematD], ['Listing date', sel.listD]] : [];
  const links = registrarLinks(choices, sel);

  return (
    <>
      <Hero eyebrow="IPO allotment status" title="Check IPO allotment status" sub="See whether you were allotted shares, using your PAN, once the registrar publishes the basis of allotment." art="checker" />
      <div className="h-wrap h-main">
        <section className="h-card h-checker" aria-labelledby="ck-h">
          <div className="h-checker-l">
            <span className="h-edu-ic"><Icon name="doc" size={30} stroke={1.5} /></span>
            <h2 id="ck-h" className="h-h3">IPO allotment checker</h2>
            <p>Find out whether you have been allotted shares in an IPO that closed in the last 90 days.</p>
          </div>
          {choices.length ? (
            <form className="h-checker-f" onSubmit={onSubmit}>
              <label className="h-lbl">Select IPO
                <select className="h-field" value={a.ipoId} onChange={(e) => a.setIpoId(e.target.value)}>
                  {choices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.date ? ` — allotment ${c.date}` : ''}</option>)}
                </select>
              </label>
              <div className="h-checker-row">
                <label className="h-lbl">Enter PAN number
                  <span className={`h-panbox${panState ? ` ${panState}` : ''}`}>
                    <input className="h-field num" value={a.pan} onChange={(e) => a.setPan(e.target.value)} placeholder="ABCDE1234F" maxLength={10} autoComplete="off" spellCheck={false} aria-describedby="pan-hint" />
                    {panState === 'ok' ? <Icon name="tick" size={18} stroke={2.4} /> : null}
                  </span>
                  <span id="pan-hint" className={`h-pan-hint ${panState}`}>{panState === 'ok' ? 'Valid PAN format' : panState === 'bad' ? 'A PAN is five letters, four digits and a letter' : 'As printed on the PAN card'}</span>
                </label>
                <button type="submit" className="h-btn h-btn-p" disabled={a.busy}><Icon name="search" size={17} />{a.busy ? 'Checking…' : 'Check allotment status'}</button>
              </div>
              <div role="status" aria-live="polite">
                {a.error ? <p className="h-err" role="alert">{a.error}</p> : null}
                {a.result ? outcomeText(a.result).map((o, i) => (
                  <div key={i} className={`h-out ${o.tone}`}><Icon name={o.tone === 'open' ? 'check' : 'info'} size={22} /><span><strong>{o.title}</strong><p>{o.body}</p></span></div>
                )) : null}
              </div>
            </form>
          ) : <p className="h-tbl-none">No IPO has closed in the last 90 days, so there is nothing to look up yet.</p>}
          <aside className="h-checker-r">
            <h3 className="h-h4"><Icon name="shield" size={20} />Your data is safe</h3>
            <p>Your PAN is sent only to run this lookup against the registrar’s published allotment file.</p>
          </aside>
        </section>

        <div className="h-row h-row-3">
          <section className="h-card" aria-labelledby="dt-h">
            <h2 id="dt-h" className="h-h3"><Icon name="calendar" size={20} />Important dates</h2>
            {sel ? <p className="h-note">{sel.name}</p> : null}
            <dl className="h-kv">{dates.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v || '—'}</dd></div>)}</dl>
          </section>
          <section className="h-card" aria-labelledby="rg-h">
            <h2 id="rg-h" className="h-h3"><Icon name="bank" size={20} />Registrar &amp; allotment links</h2>
            {links.length ? (
              <ul className="h-reg">
                {links.map((l) => <li key={l.url}><span>{l.name}</span><a href={l.url} target="_blank" rel="noopener noreferrer">Check allotment <ExtIcon /></a></li>)}
              </ul>
            ) : <p className="h-tbl-none">No registrar links have been entered for recent issues.</p>}
          </section>
          <section className="h-card" aria-labelledby="fq-h">
            <h2 id="fq-h" className="h-h3"><Icon name="help" size={20} />Need help?</h2>
            <div className="h-faq">
              {FAQ.map(([q, ans]) => <details key={q}><summary>{q}</summary><p>{ans}</p></details>)}
            </div>
          </section>
        </div>

        <section className="h-how" aria-labelledby="how-h">
          <div className="h-how-l">
            <Icon name="laptop" size={34} stroke={1.5} />
            <span><h2 id="how-h" className="h-h3">How to check IPO allotment</h2><p>Four steps, a few seconds.</p></span>
          </div>
          <ol className="h-how-s">
            {['Select the IPO you applied for', 'Enter the PAN on the application', 'Select “Check allotment status”', 'See the registrar’s result straight away'].map((s, i) => (
              <li key={s}><span className="num">{i + 1}</span>{s}</li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
