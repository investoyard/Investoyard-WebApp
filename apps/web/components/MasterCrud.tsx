'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Field, FormActions } from '@/components/ui/Form';
import { MasterBulkUpload } from '@/components/MasterBulkUpload';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog, type ConfirmState } from '@/components/ui/Confirm';
import { Loader } from '@/components/ui/Loader';
import { usePagination } from '@/components/ui/Pagination';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

const blank = (): Partial<api.MasterRow> => ({
  name: '', shortCode: '', contactPerson: '', mobile: '', email: '', phone: '',
  gstin: '', address1: '', address2: '', city: '', state: '', pincode: '', allotmentUrl: '',
});

/** Shared list + add/edit + activate/deactivate CRUD for the Lead Managers / Registrars masters. */
export function MasterCrud({ kind, title, sub, withUrl, bulk }: {
  kind: api.MasterKind; title: string; sub: string; withUrl?: boolean;
  /** offer a spreadsheet upload alongside ＋ Add — only where loading many rows at once is realistic */
  bulk?: boolean;
}) {
  const me = useOperator();
  const [rows, setRows] = useState<api.MasterRow[] | null>(null);
  const [modal, setModal] = useState<null | { id?: string; form: Partial<api.MasterRow> }>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try { setRows(await api.fetchMaster(kind)); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); setRows([]); }
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  const filtered = (rows ?? []).filter((r) =>
    !q.trim() || `${r.name} ${r.shortCode} ${r.city ?? ''} ${r.email ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  // usePagination is a HOOK, so it runs BEFORE the guards below. A hook after
  // an early return changes the hook count between renders — React #310.
  const { slice, node: pager } = usePagination(filtered, 25);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'ipos.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'ipos.manage');

  const upd = (part: Partial<api.MasterRow>) => setModal((m) => m && { ...m, form: { ...m.form, ...part } });

  const save = async () => {
    if (!modal) return;
    const f = modal.form;
    if (!f.name?.trim() || !f.shortCode?.trim()) { setModalErr('Name and short code are required.'); return; }
    setBusy(true); setModalErr(null); setMsg(null);
    try {
      if (modal.id) await api.updateMaster(kind, modal.id, f);
      else await api.createMaster(kind, f);
      setModal(null);
      await load();
      setMsg(modal.id ? 'Saved.' : 'Added.');
    } catch (e: any) { setModalErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const toggle = (r: api.MasterRow) => {
    if (!r.active) {
      api.updateMaster(kind, r.id, { active: true }).then(load).catch((e) => setErr(String(e?.message ?? e)));
      return;
    }
    setConfirm({
      title: `Deactivate ${r.name}?`, danger: true, confirmLabel: 'Deactivate',
      message: <>It disappears from the IPO form dropdowns. Existing IPOs that reference it are unaffected.</>,
      onConfirm: async () => {
        try { await api.updateMaster(kind, r.id, { active: false }); await load(); }
        catch (e: any) { setErr(String(e?.message ?? e)); }
      },
    });
  };

  return (
    <>
      <PageHead
        title={title} sub={sub}
        actions={canManage ? (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {bulk && <MasterBulkUpload kind={kind} onDone={load} />}
            <button className="btn" onClick={() => { setModalErr(null); setModal({ form: blank() }); }}>＋ Add</button>
          </div>
        ) : undefined}
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}
      {msg && <div className="banner ok" style={{ marginBottom: 14 }}>{msg}</div>}
      {!rows ? <Loader /> : (
        <div className="card">
          <div className="card-head">
            <span className="t">{title} <span className="count-badge">{rows.length}</span></span>
            <input className="input" style={{ width: 220 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Name</th><th>Code</th><th>Contact</th><th>Email / Phone</th><th>City</th>{withUrl && <th>Allotment URL</th>}<th>Status</th><th /></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={withUrl ? 8 : 7} className="muted" style={{ padding: 14 }}>{q ? 'No matches.' : 'None yet — click ＋ Add.'}</td></tr>
                ) : slice.map((r) => (
                  <tr key={r.id} style={r.active ? undefined : { opacity: 0.55 }}>
                    <td>{r.name}</td>
                    <td className="mono">{r.shortCode}</td>
                    <td>{r.contactPerson || '—'}{r.mobile ? <div className="muted mono" style={{ fontSize: 11 }}>{r.mobile}</div> : null}</td>
                    <td style={{ fontSize: 13 }}>{r.email || '—'}{r.phone ? <div className="muted mono" style={{ fontSize: 11 }}>{r.phone}</div> : null}</td>
                    <td>{r.city || '—'}</td>
                    {withUrl && <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.allotmentUrl || '—'}</td>}
                    <td><span className={`st ${r.active ? 'ok' : 'mut'}`}>{r.active ? 'Active' : 'Inactive'}</span></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canManage && (
                        <span className="row-actions">
                          <button className="icon-btn" title="Edit" onClick={() => { setModalErr(null); setModal({ id: r.id, form: { ...r } }); }}><Icon name="edit" size={15} /></button>
                          <button className={`icon-btn ${r.active ? 'danger' : 'pos'}`} title={r.active ? 'Deactivate' : 'Activate'} onClick={() => toggle(r)}><Icon name="power" size={15} /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pager}
        </div>
      )}

      {modal && (
        <Modal title={modal.id ? `Edit ${title.replace(/s$/, '').toLowerCase()}` : `Add ${title.replace(/s$/, '').toLowerCase()}`} onClose={() => setModal(null)} wide>
          {modalErr && <div className="banner warn" style={{ marginBottom: 14 }}>{modalErr}</div>}
          <div className="form-grid">
            <Field label="Name" required span={2}><input className="input" value={modal.form.name ?? ''} onChange={(e) => upd({ name: e.target.value })} /></Field>
            <Field label="Short code" required hint="unique"><input className="input mono" value={modal.form.shortCode ?? ''} onChange={(e) => upd({ shortCode: e.target.value.toUpperCase() })} /></Field>
            <Field label="Contact person"><input className="input" value={modal.form.contactPerson ?? ''} onChange={(e) => upd({ contactPerson: e.target.value })} /></Field>
            <Field label="Mobile"><input className="input mono" value={modal.form.mobile ?? ''} onChange={(e) => upd({ mobile: e.target.value })} /></Field>
            <Field label="Phone"><input className="input mono" value={modal.form.phone ?? ''} onChange={(e) => upd({ phone: e.target.value })} /></Field>
            <Field label="Email"><input className="input" value={modal.form.email ?? ''} onChange={(e) => upd({ email: e.target.value })} /></Field>
            <Field label="GSTIN"><input className="input mono" value={modal.form.gstin ?? ''} onChange={(e) => upd({ gstin: e.target.value.toUpperCase() })} /></Field>
            {withUrl && <Field label="Allotment-check URL"><input className="input" value={modal.form.allotmentUrl ?? ''} onChange={(e) => upd({ allotmentUrl: e.target.value })} placeholder="https://…" /></Field>}
            <Field label="Address line 1" span={withUrl ? 3 : 2}><input className="input" value={modal.form.address1 ?? ''} onChange={(e) => upd({ address1: e.target.value })} /></Field>
            <Field label="Address line 2" span={withUrl ? 3 : 2}><input className="input" value={modal.form.address2 ?? ''} onChange={(e) => upd({ address2: e.target.value })} /></Field>
            <Field label="City"><input className="input" value={modal.form.city ?? ''} onChange={(e) => upd({ city: e.target.value })} /></Field>
            <Field label="State"><input className="input" value={modal.form.state ?? ''} onChange={(e) => upd({ state: e.target.value })} /></Field>
            <Field label="Pincode"><input className="input mono" value={modal.form.pincode ?? ''} onChange={(e) => upd({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></Field>
          </div>
          <FormActions>
            <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : modal.id ? 'Save changes' : 'Add'}</button>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          </FormActions>
        </Modal>
      )}
      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
