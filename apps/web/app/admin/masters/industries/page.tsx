'use client';
import { SimpleMaster } from '@/components/SimpleMaster';

/**
 * Industry master — the exchanges' fine-grained Basic Industry beneath a
 * sector (146 values like "Ferro & Silica Manganese", "Plywood Boards /
 * Laminates"). Sits under Masters as its own list so the operator can
 * curate + de-duplicate the classification the IPO form's Industry picker
 * feeds off (operator ask, 2026-09-22).
 *
 * Each row optionally names its rolling-up sector, matching a row from
 * the Sectors master by name.
 */
export default function IndustriesPage() {
  return (
    <SimpleMaster
      kind="industries"
      title="Industries"
      sub="The exchange's detailed classification beneath the sector. Add one here, or straight from the IPO form's Industry box."
      extraLabel="Sector"
      renderExtra={(form, upd) => (
        <>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Rolling-up sector</label>
            <input className="input" value={form.sector ?? ''} onChange={(e) => upd({ sector: e.target.value })} placeholder="Materials · Financials · Healthcare · IT" />
            <span className="hint">Free text — best if it matches a Sectors row exactly so reports can roll up.</span>
          </div>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Description</label>
            <input className="input" value={form.description ?? ''} onChange={(e) => upd({ description: e.target.value })} placeholder="Short prose for the industry page header" />
          </div>
          <div className="field">
            <label>Rank</label>
            <input className="input mono" value={form.rank ?? ''} onChange={(e) => upd({ rank: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} placeholder="100" />
            <span className="hint">Sort order on report filters (lower = earlier).</span>
          </div>
        </>
      )}
      extraCell={(r) => (
        r.sector ? <span className="mst-badge">{r.sector}</span> : <span className="muted">—</span>
      )}
    />
  );
}
