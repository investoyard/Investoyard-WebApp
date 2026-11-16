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
      <p className="l-label">Registrar lookup</p>
      <h1 className="l-h1" style={{ marginTop: 10 }}>Allotment status</h1>
      <p className="l-lede">Checks the registrar’s file for any applicant, wherever they applied, once the basis of allotment is published. Your PAN is sent only to run this lookup.</p>
      <div className="l-two l-sec" style={{ marginTop: 32 }}>
        <div className="l-card">
          {choices.length ? <AllotForm a={a} choices={choices} onSubmit={onSubmit} /> : <p className="l-muted">No IPO has closed in the last 90 days, so there is nothing to look up yet.</p>}
        </div>
        {dated.length ? (
          <div className="l-card">
            <h2 className="serif" style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Allotment calendar</h2>
            <dl className="l-rows">{dated.map((c) => <Row key={c.id} k={c.name} v={c.date} />)}</dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}
