'use client';

import type { FormEvent } from 'react';
import { useAllotmentCheck, type AllotmentChoice } from '@/core/allotment';
import AllotForm from './AllotForm';

/* Split screen: the partner's colour on one side carrying the question and the calendar, the form on the other. */
export default function AllotmentPage({ choices }: { choices: AllotmentChoice[] }) {
  const a = useAllotmentCheck(choices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };
  const dated = choices.filter((c) => c.date).slice(0, 8);
  return (
    <div className="h-split">
      <div className="h-on">
        <div className="h-split-in">
          <p className="h-eyebrow h-soft">Allotment status</p>
          <h1 className="dsp h-split-h">Did you get the shares?</h1>
          <p className="h-soft h-allot-lede">Checks the registrar’s file for any applicant, wherever they applied, once the basis of allotment is published. Your PAN is sent only to run this lookup.</p>
          {dated.length ? (
            <>
              <h2 className="h-eyebrow h-soft" style={{ marginTop: 44 }}>Allotment calendar</h2>
              <ul className="h-cal">
                {dated.map((c) => <li key={c.id}><span>{c.name}</span><b className="num">{c.date}</b></li>)}
              </ul>
            </>
          ) : null}
        </div>
      </div>
      <div className="h-split-form">
        <div className="h-split-in">
          {choices.length ? <AllotForm a={a} choices={choices} onSubmit={onSubmit} /> : (
            <div className="h-empty" style={{ marginTop: 0 }}><strong className="dsp">No recent issues</strong><p>No IPO has closed in the last 90 days, so there is nothing to look up yet.</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
