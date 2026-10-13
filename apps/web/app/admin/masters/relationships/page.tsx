'use client';
import { SimpleMaster } from '@/components/SimpleMaster';

/**
 * Relationships master — the options offered on the add-applicant form.
 * "Allow multiple" off ⇒ that relation (Self, Spouse, Mother, Father) can be
 * added only ONCE per account; on ⇒ repeatable (Child, Sibling, Other).
 */
export default function RelationshipsPage() {
  return (
    <SimpleMaster
      kind="relationships"
      title="Relationships"
      sub="Applicant relationship options on the front site & app. 'Allow multiple' off = that relation can be added once per account."
      extraLabel="Allow multiple"
      renderExtra={(form, upd) => (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', gridColumn: 'span 3' }}>
            <input type="checkbox" checked={!!form.allowMultiple} onChange={(e) => upd({ allowMultiple: e.target.checked })} />
            <span>Allow multiple applicants with this relation (e.g. Child) — off = once per account (e.g. Mother)</span>
          </label>
          <div className="field" style={{ gridColumn: 'span 3' }}>
            <label>Description</label>
            <input className="input" value={form.description ?? ''} onChange={(e) => upd({ description: e.target.value })} placeholder="Short hint shown under the relationship picker on the profile form" />
          </div>
        </>
      )}
      extraCell={(r) => (r.allowMultiple
        ? <span className="mst-badge">multiple</span>
        : <span className="mst-badge mut">once</span>)}
    />
  );
}
