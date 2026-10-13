'use client';
import { SimpleMaster } from '@/components/SimpleMaster';

/**
 * Sector master — the broad grouping (Finance · Pharma · IT · Bank) used for
 * filtering, IPO categories and every sector-wise report.
 *
 * Deliberately NOT the same thing as an IPO's `industry`, which holds the
 * exchanges' fine-grained Basic Industry — 146 values like "Ferro & Silica
 * Manganese". Many industries roll up into one sector, and `industries` below
 * IS that roll-up: it is stored as data rather than buried in code so the
 * operator can correct a mapping without a deploy. scripts/seed-sectors.js
 * used it to derive a sector for the 850 records that already carried an
 * industry, which is why none of them needed re-entry.
 */
export default function SectorsPage() {
  return (
    <SimpleMaster
      kind="sectors"
      title="Sectors"
      sub="The broad grouping shown on IPOs and used by the sector-wise reports. Add one here, or straight from the IPO form's Sector box."
      extraLabel="Industries mapped"
      renderExtra={(form, upd) => (
        <>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Industries that roll up here</label>
            <textarea
              className="input" rows={4}
              value={(form.industries ?? []).join('\n')}
              onChange={(e) => upd({ industries: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
              placeholder={'Pharmaceuticals\nBiotechnology\nPharmacy Retail'}
            />
            <span className="hint">
              One per line, matching the exchange&rsquo;s industry wording. Used to derive an IPO&rsquo;s
              sector from its industry — leave blank to set the sector by hand only.
            </span>
          </div>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Description</label>
            <input className="input" value={form.description ?? ''} onChange={(e) => upd({ description: e.target.value })} placeholder="Short prose for the sector page header" />
          </div>
          <div className="field">
            <label>Rank</label>
            <input className="input mono" value={form.rank ?? ''} onChange={(e) => upd({ rank: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} placeholder="100" />
            <span className="hint">Sort order on report filters (lower = earlier).</span>
          </div>
        </>
      )}
      extraCell={(r) => (
        r.industries?.length
          ? <span className="mst-badge" title={r.industries.join(', ')}>{r.industries.length} industr{r.industries.length === 1 ? 'y' : 'ies'}</span>
          : <span className="muted">—</span>
      )}
    />
  );
}
