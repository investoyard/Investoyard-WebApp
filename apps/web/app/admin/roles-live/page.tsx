'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Field, FormActions } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog, type ConfirmState } from '@/components/ui/Confirm';
import { RowMenu } from '@/components/ui/RowMenu';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

const SCOPES = [
  { v: 'own', d: 'Own tenant only' },
  { v: 'subtree', d: 'Tenant + sub-tenants' },
  { v: 'all', d: 'All tenants (platform)' },
];

export default function AdminRolesLive() {
  const me = useOperator();
  const [roles, setRoles] = useState<api.Role[]>([]);
  const [perms, setPerms] = useState<api.Permission[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // role id being edited, or null = create/duplicate
  const [form, setForm] = useState<{ name: string; scope: string; perms: Set<string> }>({ name: '', scope: 'own', perms: new Set() });
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const [r, p] = await Promise.all([api.fetchRoles(), api.fetchPermissions()]); setRoles(r); setPerms(p); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const g: Record<string, api.Permission[]> = {};
    for (const p of perms) (g[p.group] ??= []).push(p);
    return g;
  }, [perms]);
  const allKeys = useMemo(() => perms.map((p) => p.key), [perms]);

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const isSuper = (r: api.Role) => r.permissions.includes('*');
  const askDelete = (r: api.Role) => setConfirm({
    title: `Delete role “${r.name}”?`, danger: true, confirmLabel: 'Delete role',
    message: <>Operators using this role will lose its permissions. This can’t be undone.</>,
    onConfirm: () => run(() => api.deleteRole(r.id), 'Role deleted.'),
  });
  const openCreate = () => { setEditing(null); setForm({ name: '', scope: 'own', perms: new Set() }); setErr(null); setOpen(true); };
  const openEdit = (r: api.Role, duplicate = false) => {
    const star = isSuper(r);
    setEditing(duplicate || star ? null : r.id); // '*' role → force duplicate (can't edit)
    setForm({ name: duplicate || star ? `${r.name} copy` : r.name, scope: r.scope, perms: new Set(star ? allKeys : r.permissions) });
    setErr(null); setOpen(true);
  };
  const toggle = (key: string) => setForm((f) => { const p = new Set(f.perms); p.has(key) ? p.delete(key) : p.add(key); return { ...f, perms: p }; });
  const setGroup = (keys: string[], on: boolean) => setForm((f) => { const p = new Set(f.perms); keys.forEach((k) => (on ? p.add(k) : p.delete(k))); return { ...f, perms: p }; });
  const allOn = form.perms.size === allKeys.length && allKeys.length > 0;

  const run = async (fn: () => Promise<any>, okMsg: string) => {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); await load(); setMsg(okMsg); return true; }
    catch (e: any) { setErr(String(e?.message ?? e)); return false; }
    finally { setBusy(false); }
  };
  const onSave = async () => {
    const permissions = [...form.perms];
    if (!form.name.trim()) return setErr('Enter a role name.');
    if (permissions.length === 0) return setErr('Select at least one permission.');
    const ok = editing
      ? await run(() => api.updateRole(editing, { scope: form.scope, permissions }), 'Role updated.')
      : await run(() => api.createRole({ name: form.name.trim(), scope: form.scope, permissions }), 'Role created.');
    if (ok) setOpen(false);
  };

  if (!operatorCan(me, 'roles.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'roles.manage');

  return (
    <>
      <PageHead
        title="Roles & permissions"
        sub="What each operator type can do. Edit any role's permissions; only the SuperAdmin role is locked."
        actions={canManage ? <button className="btn" onClick={openCreate}>＋ New role</button> : undefined}
      />
      {err && !open && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      {msg && <div className="banner ok" style={{ marginBottom: 16 }}>{msg}</div>}

      {loading ? <Loader /> : (
        <div className="card">
          <div className="card-head"><span className="t">Roles <span className="count-badge">{roles.length}</span></span></div>
          <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Role</th><th>Scope</th><th>Permissions</th><th></th></tr></thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.name}</b>{r.isSystem && <span className="st mut" style={{ marginLeft: 8 }}>system</span>}</td>
                  <td className="mono" style={{ fontSize: 13 }}>{r.scope}</td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{isSuper(r) ? 'All permissions' : `${r.permissions.length} permission${r.permissions.length === 1 ? '' : 's'}`}</td>
                  <td>
                    {canManage && (
                      <span className="row-actions">
                        {!isSuper(r) && <button className="icon-btn" onClick={() => openEdit(r)} title="Edit"><Icon name="edit" size={15} /></button>}
                        <RowMenu>
                          <button onClick={() => openEdit(r, true)}><Icon name="copy" size={15} /> Duplicate</button>
                          {!r.isSystem && !isSuper(r) && <button className="danger" disabled={busy} onClick={() => askDelete(r)}><Icon name="trash" size={15} /> Delete role</button>}
                        </RowMenu>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}

      {open && (
        <Modal title={editing ? `Edit role — ${form.name}` : 'New role'} sub="Pick a scope, then tick the areas this role can access." onClose={() => setOpen(false)} wide>
          {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <Field label="Role name" required span={2}><input className="input" value={form.name} disabled={!!editing} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Regional Manager" /></Field>
            <Field label="Scope"><select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>{SCOPES.map((sc) => <option key={sc.v} value={sc.v}>{sc.d}</option>)}</select></Field>
          </div>

          <div className="between" style={{ marginBottom: 10 }}>
            <label className="muted" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Permissions</label>
            <label className="row" style={{ gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--brand)', cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} checked={allOn} onChange={(e) => setGroup(allKeys, e.target.checked)} /> Select all
            </label>
          </div>

          {Object.entries(groups).map(([group, list]) => {
            const keys = list.map((p) => p.key);
            const on = keys.filter((k) => form.perms.has(k));
            const groupAll = on.length === keys.length;
            return (
              <div className="perm-card" key={group}>
                <div className="perm-card-head">
                  <span className="g">{group} <span style={{ color: 'var(--text-faint)' }}>· {on.length}/{keys.length}</span></span>
                  <label className="sa"><input type="checkbox" checked={groupAll} ref={(el) => { if (el) el.indeterminate = on.length > 0 && !groupAll; }} onChange={(e) => setGroup(keys, e.target.checked)} /> Select all</label>
                </div>
                <div className="perm-list">
                  {list.map((p) => {
                    const isOn = form.perms.has(p.key);
                    return <label key={p.key} className={`perm-check ${isOn ? 'on' : ''}`}><input type="checkbox" checked={isOn} onChange={() => toggle(p.key)} /> {p.label}</label>;
                  })}
                </div>
              </div>
            );
          })}

          <FormActions>
            <button className="btn" disabled={busy} onClick={onSave}>{editing ? 'Save changes' : 'Create role'}</button>
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <span className="spacer" />
            <span className="muted" style={{ fontSize: 12 }}>{form.perms.size} selected</span>
          </FormActions>
        </Modal>
      )}
      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
