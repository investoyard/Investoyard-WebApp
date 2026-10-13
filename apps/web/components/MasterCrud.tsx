'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Field, FormActions } from '@/components/ui/Form';
import { MasterBulkUpload } from '@/components/MasterBulkUpload';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog, type ConfirmState } from '@/components/ui/Confirm';
import { RowMenu } from '@/components/ui/RowMenu';
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
  const [viewing, setViewing] = useState<api.MasterRow | null>(null);
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

  // Perm mapping mirrors KIND_PERM in apps/api/src/modules/masters/masters.module.ts.
  // Every master menu has its OWN perm now — a partner with only registrars.manage
  // sees "Add Registrar" but not "Add Lead Manager".
  const KIND_PERM: Record<string, string> = {
    'lead-managers': 'masters.lead-managers.manage',
    registrars: 'masters.registrars.manage',
    'ipo-categories': 'masters.ipo-category.manage',
    'issue-types': 'masters.ipo-category.manage',
    relationships: 'masters.relationships.manage',
    'upi-handles': 'masters.upi-handles.manage',
    anchors: 'masters.anchors.manage',
    sectors: 'masters.sectors.manage',
  };
  const mkPerm = KIND_PERM[kind] ?? 'ipos.view';

  if (!me) return <Loader />;
  if (!operatorCan(me, 'ipos.view') && !operatorCan(me, mkPerm)) return <NoAccess />;
  const canManage = operatorCan(me, mkPerm);

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

  /** Hard-delete a master row — superadmin only, server refuses when the
   *  row is referenced by any IPO / investor profile. Confirm dialog
   *  quotes the 409 back so it's clear which records still bind. */
  const askDelete = (r: api.MasterRow) => setConfirm({
    title: `Delete ${r.name} permanently?`, danger: true, confirmLabel: 'Delete',
    message: <>The row is removed from the master. If it's referenced by any IPO or investor profile, the server will refuse and tell you where.</>,
    onConfirm: async () => {
      try { await api.deleteMaster(kind, r.id); await load(); setMsg(`${r.name} deleted.`); }
      catch (e: any) { setErr(String(e?.message ?? e)); }
    },
  });

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
            <table className="table mst-tbl" style={{ width: '100%' }}>
              <thead><tr>
                <th>Name</th><th>Code</th><th className="r">IPOs</th>
                <th>Contact</th><th>Email / Phone</th><th>City</th>
                {/* Allotment URL dropped from the list (operator ask
                    2026-09-10) — it's a long URL that pushed other columns
                    off-screen. Still edited in the modal and visible on
                    the new View sheet. */}
                <th style={{ textAlign: 'center' }}>Status</th>
                <th />
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="muted" style={{ padding: 14 }}>{q ? 'No matches.' : 'None yet — click ＋ Add.'}</td></tr>
                ) : slice.map((r) => (
                  <tr key={r.id} style={r.active ? undefined : { opacity: 0.55 }}>
                    <td style={{ whiteSpace: 'nowrap' }}><span className="mst-name">{r.name}</span></td>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}><span className="mst-code">{r.shortCode}</span></td>
                    <td className="r mono">{r.ipoCount != null && r.ipoCount > 0
                      ? <span className="mst-ipos">{r.ipoCount.toLocaleString('en-IN')}</span>
                      : <span className="muted">—</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.contactPerson || <span className="muted">—</span>}{r.mobile ? <div className="muted mono" style={{ fontSize: 11 }}>{r.mobile}</div> : null}</td>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{r.email || <span className="muted">—</span>}{r.phone ? <div className="muted mono" style={{ fontSize: 11 }}>{r.phone}</div> : null}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.city || <span className="muted">—</span>}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`rl-st ${r.active ? 'on' : 'off'}`}>
                        <span className="rl-dot" />{r.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span className="row-actions">
                        <button className="icon-btn" title="View details" onClick={() => setViewing(r)}><Icon name="eye" size={15} /></button>
                        {canManage && <>
                          <button className="icon-btn" title="Edit" onClick={() => { setModalErr(null); setModal({ id: r.id, form: { ...r } }); }}><Icon name="edit" size={15} /></button>
                          <button className={`icon-btn ${r.active ? 'danger' : 'pos'}`} title={r.active ? 'Deactivate' : 'Activate'} onClick={() => toggle(r)}><Icon name="power" size={15} /></button>
                          {me.isSuperAdmin && (
                            <RowMenu>
                              <button className="danger" onClick={() => askDelete(r)}>
                                <Icon name="trash" size={14} /> Delete permanently
                              </button>
                            </RowMenu>
                          )}
                        </>}
                      </span>
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
            {/* Reporting extras (2026-09-11) — SEBI registration, founded
                year, web presence, and free-text notes. Optional on both
                Registrars and Lead Managers. */}
            <Field label="SEBI Reg. No" hint="INM… / INR… — for regulator-facing exports"><input className="input mono" value={modal.form.sebiRegNo ?? ''} onChange={(e) => upd({ sebiRegNo: e.target.value.toUpperCase() })} placeholder="INMxxxxxxxx" /></Field>
            <Field label="Founded year"><input className="input mono" value={modal.form.foundedYear ?? ''} onChange={(e) => upd({ foundedYear: e.target.value ? Number(e.target.value.replace(/\D/g, '').slice(0, 4)) : null })} placeholder="1998" /></Field>
            <Field label="Website"><input className="input" value={modal.form.website ?? ''} onChange={(e) => upd({ website: e.target.value })} placeholder="https://…" /></Field>
            <Field label="LinkedIn"><input className="input" value={modal.form.linkedin ?? ''} onChange={(e) => upd({ linkedin: e.target.value })} placeholder="https://linkedin.com/company/…" /></Field>
            <Field label="Notes" span={2} hint="operator-only, never shown on the public site"><textarea className="input" rows={2} value={modal.form.notes ?? ''} onChange={(e) => upd({ notes: e.target.value })} /></Field>
          </div>
          <FormActions>
            <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : modal.id ? 'Save changes' : 'Add'}</button>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          </FormActions>
        </Modal>
      )}
      {viewing && <MasterViewModal row={viewing} withUrl={!!withUrl} onClose={() => setViewing(null)} onEdit={canManage ? () => { setModalErr(null); setModal({ id: viewing.id, form: { ...viewing } }); setViewing(null); } : undefined} />}
      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}

/** Read-only detail view of a master row (Registrars / Lead Managers). All
 *  fields including the AllotmentUrl live here — the list column was dropped
 *  on 2026-09-10 because the URL crowded the row on narrower viewports. */
function MasterViewModal({ row, withUrl, onClose, onEdit }: {
  row: api.MasterRow; withUrl: boolean;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="kv"><span className="k">{k}</span><span className="v">{v ?? <span className="muted">—</span>}</span></div>
  );
  return (
    <Modal title={row.name} sub={`Registrar / lead-manager master${row.shortCode ? ` · ${row.shortCode}` : ''}`} onClose={onClose} wide>
      <div className="form-grid" style={{ gap: 6 }}>
        <Row k="Name" v={row.name} />
        <Row k="Short code" v={row.shortCode ? <span className="mono">{row.shortCode}</span> : null} />
        <Row k="Status" v={<span className={`rl-st ${row.active ? 'on' : 'off'}`}><span className="rl-dot" />{row.active ? 'Active' : 'Inactive'}</span>} />
        <Row k="IPOs handled" v={row.ipoCount != null ? row.ipoCount.toLocaleString('en-IN') : null} />
        <Row k="Contact person" v={row.contactPerson} />
        <Row k="Mobile" v={row.mobile ? <span className="mono">{row.mobile}</span> : null} />
        <Row k="Phone" v={row.phone ? <span className="mono">{row.phone}</span> : null} />
        <Row k="Email" v={row.email} />
        <Row k="GSTIN" v={row.gstin ? <span className="mono">{row.gstin}</span> : null} />
        <Row k="Address line 1" v={row.address1} />
        <Row k="Address line 2" v={row.address2} />
        <Row k="City" v={row.city} />
        <Row k="State" v={row.state} />
        <Row k="PIN" v={row.pincode ? <span className="mono">{row.pincode}</span> : null} />
        {withUrl && (
          <Row k="Allotment-check URL" v={row.allotmentUrl
            ? <a href={row.allotmentUrl} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{row.allotmentUrl}</a>
            : null} />
        )}
        <Row k="SEBI Reg. No" v={row.sebiRegNo ? <span className="mono">{row.sebiRegNo}</span> : null} />
        <Row k="Founded year" v={row.foundedYear ?? null} />
        <Row k="Website" v={row.website
          ? <a href={row.website} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{row.website}</a>
          : null} />
        <Row k="LinkedIn" v={row.linkedin
          ? <a href={row.linkedin} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{row.linkedin}</a>
          : null} />
        <Row k="Notes" v={row.notes ? <span style={{ whiteSpace: 'pre-wrap' }}>{row.notes}</span> : null} />
      </div>
      <FormActions>
        {onEdit && <button className="btn" onClick={onEdit}><Icon name="edit" size={14} /> Edit</button>}
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </FormActions>
    </Modal>
  );
}
