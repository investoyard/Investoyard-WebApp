'use client';
import { SimpleMaster } from '@/components/SimpleMaster';

const TYPES = ['Mutual Fund', 'FPI', 'Insurance', 'AIF', 'Bank', 'Corporate', 'Other'];

/**
 * Anchor Investors master — institutions reusable across IPOs. Pick them (with
 * a per-IPO ₹ amount) in the IPO form's Company tab; shown on the detail page.
 */
export default function AnchorsPage() {
  return (
    <SimpleMaster
      kind="anchors"
      title="Anchor Investors"
      sub="Institutions that anchor IPOs — add once, reuse on every issue from the IPO form (Company tab)."
      extraLabel="Type"
      renderExtra={(form, upd) => (
        <>
          <div className="field">
            <label>Type</label>
            <select className="input" value={form.type ?? ''} onChange={(e) => upd({ type: e.target.value })}>
              <option value="">—</option>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label>AUM (₹ Cr)</label>
            <input className="input mono" value={form.aumCr ?? ''} onChange={(e) => upd({ aumCr: e.target.value ? Number(e.target.value.replace(/[^\d.]/g, '')) : null })} placeholder="12500" />
          </div>
          <div className="field">
            <label>Country</label>
            <input className="input" value={form.country ?? ''} onChange={(e) => upd({ country: e.target.value })} placeholder="India / US / SG" />
          </div>
          <div className="field">
            <label>SEBI / FPI code</label>
            <input className="input mono" value={form.sebiCode ?? ''} onChange={(e) => upd({ sebiCode: e.target.value })} placeholder="Category I / II" />
          </div>
          <div className="field">
            <label>First anchor year</label>
            <input className="input mono" value={form.firstAnchorYear ?? ''} onChange={(e) => upd({ firstAnchorYear: e.target.value ? Number(e.target.value.replace(/\D/g, '').slice(0, 4)) : null })} placeholder="2015" />
          </div>
          <div className="field">
            <label>Website</label>
            <input className="input" value={form.website ?? ''} onChange={(e) => upd({ website: e.target.value })} placeholder="https://…" />
          </div>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Notes</label>
            <input className="input" value={form.notes ?? ''} onChange={(e) => upd({ notes: e.target.value })} placeholder="optional" />
          </div>
        </>
      )}
      extraCell={(r) => (r.type ? <span className="mst-badge">{r.type}</span> : <span className="muted">—</span>)}
      bulk
    />
  );
}
