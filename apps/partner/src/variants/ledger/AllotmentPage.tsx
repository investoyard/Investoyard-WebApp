'use client';

import type { FormEvent } from 'react';
import { useAllotmentCheck, type AllotmentChoice } from '@/core/allotment';
import AllotForm from './AllotForm';
import { Row } from './parts';

export default function AllotmentPage({ choices }: { choices: AllotmentChoice[] }) {
  const a = useAllotmentCheck(choices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };
  const dated = choices.filter((c) => c.date).slice(0, 12);
  return (
    <div className="l-page">
      <h1>Allotment status</h1>
      <p className="l-lede">Checks the registrar’s file for any applicant, wherever they applied, once the basis of allotment is published. Your PAN is sent only to run this lookup.</p>
      {choices.length ? <AllotForm a={a} choices={choices} onSubmit={onSubmit} /> : <p className="l-empty">No IPO has closed in the last 90 days, so there is nothing to look up yet.</p>}
      {dated.length ? (
        <section className="l-sec" aria-labelledby="cal-h">
          <div className="l-sec-h"><h2 id="cal-h">Allotment calendar</h2><span className="l-label">Closed in the last 90 days</span></div>
          <dl className="l-rows" style={{ marginTop: 10 }}>{dated.map((c) => <Row key={c.id} k={c.name} v={c.date} />)}</dl>
        </section>
      ) : null}
    </div>
  );
}
