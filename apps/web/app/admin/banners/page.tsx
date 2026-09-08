'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Field, FormActions } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

/**
 * Homepage banners — the admin-managed slides mixed into the front-site
 * carousel (between the brand slide and the auto-generated IPO slides).
 * Text slide by default; upload an image for a full-bleed promo.
 */
export default function BannersPage() {
  const me = useOperator();
  const [rows, setRows] = useState<api.BannerRow[] | null>(null);
  const [modal, setModal] = useState<null | { id?: string; form: Partial<api.BannerRow> }>(null);
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.fetchBanners().then((r) => { setRows(r); setErr(null); }).catch((e) => { setErr(String(e?.message ?? e)); setRows([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'ipos.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'banners.manage');
  const upd = (part: Partial<api.BannerRow>) => setModal((m) => m && { ...m, form: { ...m.form, ...part } });

  const save = async () => {
    if (!modal?.form.title?.trim()) { setModalErr('Title is required.'); return; }
    setBusy(true); setModalErr(null);
    const body = {
      title: modal.form.title, subtitle: modal.form.subtitle ?? '', imageUrl: modal.form.imageUrl ?? '',
      linkUrl: modal.form.linkUrl ?? '', ctaLabel: modal.form.ctaLabel ?? '',
      active: modal.form.active ?? true, sortOrder: Number(modal.form.sortOrder ?? 100),
      startsAt: modal.form.startsAt ?? '', endsAt: modal.form.endsAt ?? '',
    };
    try {
      if (modal.id) await api.updateBanner(modal.id, body);
      else await api.createBanner(body);
      setModal(null); load();
    } catch (e: any) { setModalErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const toggle = async (r: api.BannerRow) => {
    try { await api.updateBanner(r.id, { active: !r.active }); load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
  };
  const remove = async (r: api.BannerRow) => {
    try { await api.deleteBanner(r.id); load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
  };
  const onImage = async (file?: File | null) => {
    if (!file) return;
    setImgBusy(true); setModalErr(null);
    try { upd({ imageUrl: await api.uploadImage(file) }); }
    catch (e: any) { setModalErr(String(e?.message ?? e)); }
    finally { setImgBusy(false); }
  };

  const d = (s?: string | null) => (s ? String(s).slice(0, 10) : '');

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHead
        title="Homepage Banners"
        sub="Custom slides in the front-site carousel — shown after the brand slide, before the auto IPO slides. Optional date window."
        actions={canManage ? <button className="btn" onClick={() => setModal({ form: { active: true, sortOrder: 100 } })}><Icon name="plus" size={15} /> Add banner</button> : undefined}
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}

      {rows === null ? <Loader /> : (
        <div className="card"><div className="card-pad">
          {rows.length === 0 ? (
            <div className="muted" style={{ padding: '18px 0', textAlign: 'center' }}>No custom banners — the carousel runs on the brand slide + auto IPO slides.</div>
          ) : (
            <table className="table">
              <thead><tr><th>Order</th><th>Banner</th><th>Link</th><th>Window</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.sortOrder}</td>
                    <td>
                      <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'nowrap' }}>
                        {r.imageUrl
                          ? <img src={r.imageUrl} alt="" style={{ width: 72, height: 34, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                          : <span style={{ width: 72, height: 34, borderRadius: 6, background: 'var(--brand-50)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>TEXT</span>}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{r.title}</div>
                          {r.subtitle && <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{r.subtitle}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.linkUrl ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{d(r.startsAt) || '—'} → {d(r.endsAt) || '—'}</td>
                    <td>
                      {r.active
                        ? <span className="pill" style={{ background: 'var(--pos-soft)', color: 'var(--pos)' }}>live</span>
                        : <span className="pill">off</span>}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canManage && (
                        <span className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <button className="icon-btn" title="Edit" onClick={() => setModal({ id: r.id, form: { ...r, startsAt: d(r.startsAt), endsAt: d(r.endsAt) } })}><Icon name="edit" size={14} /></button>
                          <button className="icon-btn" title={r.active ? 'Turn off' : 'Turn on'} onClick={() => toggle(r)}><Icon name="power" size={14} /></button>
                          <button className="icon-btn danger" title="Delete" onClick={() => remove(r)}><Icon name="trash" size={14} /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div></div>
      )}

      {modal && (
        <Modal title={modal.id ? 'Edit banner' : 'Add banner'} onClose={() => setModal(null)}>
          {modalErr && <div className="banner warn" style={{ marginBottom: 14 }}>{modalErr}</div>}
          <div className="form-grid">
            <Field label="Title" required span={3}><input className="input" value={modal.form.title ?? ''} onChange={(e) => upd({ title: e.target.value })} placeholder="e.g. ARDEE IPO allotment is out" /></Field>
            <Field label="Subtitle" span={3}><input className="input" value={modal.form.subtitle ?? ''} onChange={(e) => upd({ subtitle: e.target.value })} placeholder="one supporting line (optional)" /></Field>
            <Field label="Image" hint="Optional — full-bleed slide (~1200×260). Without it, a branded text slide." span={2}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                {modal.form.imageUrl && <img src={modal.form.imageUrl} alt="" style={{ width: 90, height: 40, objectFit: 'cover', borderRadius: 6 }} />}
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  {imgBusy ? 'Uploading…' : modal.form.imageUrl ? 'Replace' : <><Icon name="upload" size={14} /> Upload</>}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onImage(e.target.files?.[0])} />
                </label>
                {modal.form.imageUrl && <button type="button" className="icon-btn danger" onClick={() => upd({ imageUrl: '' })}><Icon name="trash" size={14} /></button>}
              </div>
            </Field>
            <Field label="Sort order" hint="Lower shows first"><input className="input mono" value={String(modal.form.sortOrder ?? 100)} onChange={(e) => upd({ sortOrder: Number(e.target.value.replace(/\D/g, '') || 0) })} /></Field>
            <Field label="Link URL" span={2}><input className="input" value={modal.form.linkUrl ?? ''} onChange={(e) => upd({ linkUrl: e.target.value })} placeholder="/ipos/ARDEE or https://…" /></Field>
            <Field label="Button label"><input className="input" value={modal.form.ctaLabel ?? ''} onChange={(e) => upd({ ctaLabel: e.target.value })} placeholder="Know more" /></Field>
            <Field label="Show from"><input className="input" type="date" value={modal.form.startsAt ?? ''} onChange={(e) => upd({ startsAt: e.target.value })} /></Field>
            <Field label="Show until"><input className="input" type="date" value={modal.form.endsAt ?? ''} onChange={(e) => upd({ endsAt: e.target.value })} /></Field>
            <Field label="Active"><label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, cursor: 'pointer' }}><input type="checkbox" checked={modal.form.active ?? true} onChange={(e) => upd({ active: e.target.checked })} /> Show on the site</label></Field>
          </div>
          <FormActions>
            <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save banner'}</button>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          </FormActions>
        </Modal>
      )}
    </div>
  );
}
