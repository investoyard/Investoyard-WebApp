'use client';
import { type IpoFull } from '@/lib/api';
import { IpoLogo } from '@/components/IpoLogo';
import { priceBand } from '@/lib/format';

/**
 * Print-PDF flow (ASBA forms) — Phase 2 fills this shell with:
 * family multi-select → master quantity (presets / custom by-amount / by-lots)
 * → per-member overrides → prefilled form download per member.
 */
export function PrintFlow({ ipo }: { ipo: IpoFull }) {
  return (
    <div className="container" style={{ paddingTop: 28, paddingBottom: 48, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <IpoLogo logo={(ipo as any).logo} name={ipo.name} size={48} />
        <div>
          <h1 style={{ fontSize: 22, letterSpacing: '-.02em' }}>Print ASBA forms</h1>
          <p className="muted" style={{ fontSize: 13.5 }}>{ipo.name} · {priceBand(ipo.priceBandMin, ipo.priceBandMax)}</p>
        </div>
      </div>
      <div className="panel" style={{ padding: 28, textAlign: 'center' }}>
        <p style={{ fontWeight: 600, marginBottom: 6 }}>Prefilled ASBA form printing is being prepared for this issue.</p>
        <p className="muted" style={{ fontSize: 13.5 }}>Select family members, choose lots per member, and print bank-ready forms — available here shortly.</p>
        <a className="btn" href={`/ipos/${ipo.symbol}`} style={{ marginTop: 16 }}>← Back to IPO</a>
      </div>
    </div>
  );
}
