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
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

/**
 * Simple name+link masters (IPO Category, Issue Type): list, add/edit, activate/deactivate.
 * `extra` renders the kind-specific field (platform type / category link) inside the modal
 * and its value in the list's middle column.
 */
export function SimpleMaster({ kind, title, sub, extraLabel, renderExtra, extraCell, embedded, bulk }: {
  kind: api.MasterKind;
  title: string;
  sub: string;
  extraLabel?: string;
  renderExtra: (form: Partial<api.MasterRow>, upd: (part: Partial<api.MasterRow>) => void) => React.ReactNode;
  extraCell?: (row: api.MasterRow) => React.ReactNode;
  /** render without the page header (for tabbed hosting) — the Add button moves into the card head */
  embedded?: boolean;
  /** offer a spreadsheet upload alongside ＋ Add */
  bulk?: boolean;
}) {
  const me = useOperator();
  const [rows, setRows] = useState<api.MasterRow[] | null>(null);
  const [modal, setModal] = useState<null | { id?: string; form: Partial<api.MasterRow> }>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await api.fetchMaster(kind)); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); setRows([]); }
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'ipos.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'ipos.manage');
  const upd = (part: Partial<api.MasterRow>) => setModal((m) => m && { ...m, form: { ...m.form, ...part } });

  const save = async () => {
    if (!modal || !modal.form.name?.trim()) { setModalErr('Name is required.'); return; }
    setBusy(true); setModalErr(null);
    try {
      if (modal.id) await api.updateMaster(kind, modal.id, modal.form);
      else await api.createMaster(kind, modal.form);
      setModal(null);
      await load();
    } catch (e: any) { setModalErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const toggle = (r: api.MasterRow) => {
    if (!r.active) { api.updateMaster(kind, r.id, { active: true }).then(load).catch((e) => setErr(String(e?.message ?? e))); return; }
    setConfirm({
      title: `Deactivate ${r.name}?`, danger: true, confirmLabel: 'Deactivate',
      message: <>It disappears from the IPO form dropdowns. Existing IPOs are unaffected.</>,
      onConfirm: async () => { try { await api.updateMaster(kind, r.id, { active: false }); await load(); } catch (e: any) { setErr(String(e?.message ?? e)); } },
    });
  };

  return (
    <>
      {!embedded && (
        <PageHead title={title} sub={sub}
          actions={canManage ? (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {bulk && <MasterBulkUpload kind={kind} onDone={load} />}
              <button className="btn" onClick={() => { setModalErr(null); setModal({ form: { name: '', active: true } }); }}>＋ Add</button>
            </div>
          ) : undefined} />
      )}
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}
      {!rows ? <Loader /> : (
        <div className="card">
          <div className="card-head">
            <span className="t">{title} <span className="count-badge">{rows.length}</span></span>
            {embedded && canManage && <button className="btn btn-sm" onClick={() => { setModalErr(null); setModal({ form: { name: '', active: true } }); }}>＋ Add</button>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Name</th>{extraLabel && <th>{extraLabel}</th>}<th>Status</th><th /></tr></thead>
              <tbody>
                {rows.length === 0 ? <tr><td colSpan={extraLabel ? 4 : 3} className="muted" style={{ padding: 14 }}>None yet — click ＋ Add.</td></tr> :
                  rows.map((r) => (
                    <tr key={r.id} style={r.active ? undefined : { opacity: 0.55 }}>
                      <td>{r.name}</td>
                      {extraCell && <td>{extraCell(r)}</td>}
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
        </div>
      )}

      {modal && (
        <Modal title={modal.id ? `Edit ${title.replace(/s$/, '').toLowerCase()}` : `Add ${title.replace(/s$/, '').toLowerCase()}`} onClose={() => setModal(null)}>
          {modalErr && <div className="banner warn" style={{ marginBottom: 14 }}>{modalErr}</div>}
          <div className="form-grid">
            <Field label="Name" required span={3}><input className="input" value={modal.form.name ?? ''} onChange={(e) => upd({ name: e.target.value })} /></Field>
            {renderExtra(modal.form, upd)}
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
