'use client';
import { SimpleMaster } from '@/components/SimpleMaster';

const TYPES = ['Mutual Fund', 'FPI', 'Insurance', 'AIF', 'Other'];

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
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Notes</label>
            <input className="input" value={form.notes ?? ''} onChange={(e) => upd({ notes: e.target.value })} placeholder="optional" />
          </div>
        </>
      )}
      extraCell={(r) => (r.type ? <span className="pill">{r.type}</span> : <span className="muted">—</span>)}
    />
  );
}
