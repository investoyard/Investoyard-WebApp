'use client';
import { useRef, useState } from 'react';
import { Section, Field } from '@/components/ui/Form';
import { EMPANELMENT, PRODUCT_OPTIONS, isIndividual, type EField } from '@/lib/empanelment';
import { uploadDoc } from '@/lib/tenants-admin';

type Profile = Record<string, any>;

/** A single document upload field — stores { url, name } in the profile under the field key. */
function DocField({ field, value, onChange }: { field: EField; value?: { url: string; name: string }; onChange: (v: { url: string; name: string } | undefined) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true); setErr(null);
    try { onChange(await uploadDoc(file)); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <Field label={field.label} hint={err ?? undefined}>
      <div className={`up-doc ${value ? 'set' : ''}`}>
        <input ref={ref} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0])} />
        {value ? (
          <>
            <a href={value.url} target="_blank" rel="noreferrer" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name}</a>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(undefined)}>Remove</button>
          </>
        ) : (
          <>
            <span style={{ flex: 1, color: 'var(--text-faint)' }}>{busy ? 'Uploading…' : 'No file'}</span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => ref.current?.click()}>Upload</button>
          </>
        )}
      </div>
    </Field>
  );
}

/** Renders the full empanelment form into `profile`, filtered by applicant type. */
export function EmpanelmentFields({ profile, onChange, startAt = 1 }: { profile: Profile; onChange: (next: Profile) => void; startAt?: number }) {
  const set = (k: string, v: any) => onChange({ ...profile, [k]: v });
  const individual = isIndividual(profile.applicantType);
  const show = (f: EField) => !f.showFor || (f.showFor === 'individual') === individual;

  const renderField = (f: EField) => {
    if (f.type === 'doc') return <DocField key={f.key} field={f} value={profile[f.key]} onChange={(v) => set(f.key, v)} />;
    if (f.type === 'products') {
      const sel: string[] = profile[f.key] ?? [];
      return (
        <Field key={f.key} label={f.label} full>
          <div className="row" style={{ flexWrap: 'wrap', gap: 14, paddingTop: 4 }}>
            {PRODUCT_OPTIONS.map((p) => (
              <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14 }}>
                <input type="checkbox" style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
                  checked={sel.includes(p)}
                  onChange={() => set(f.key, sel.includes(p) ? sel.filter((x) => x !== p) : [...sel, p])} /> {p}
              </label>
            ))}
          </div>
        </Field>
      );
    }
    return (
      <Field key={f.key} label={f.label} required={f.required} hint={f.hint} span={f.span} full={f.full}>
        {f.type === 'textarea' ? (
          <textarea className="input" style={{ minHeight: 64 }} value={profile[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
        ) : f.type === 'select' ? (
          <select className="input" value={profile[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">Select…</option>
            {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input className="input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
            inputMode={f.type === 'tel' ? 'tel' : f.type === 'number' ? 'numeric' : undefined}
            value={profile[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
        )}
      </Field>
    );
  };

  return (
    <>
      {EMPANELMENT.map((s, i) => (
        <Section key={s.key} n={startAt + i} title={s.title} desc={s.desc}>
          {s.fields.filter(show).map(renderField)}
        </Section>
      ))}
    </>
  );
}
