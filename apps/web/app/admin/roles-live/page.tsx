'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOperator } from "@/lib/operator-context";
import { operatorCan } from "@/lib/operator";
import { NoAccess } from '@/components/AdminUI';
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
  const [editing, setEditing] = useState<string | null>(null); // role id, or null = create
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

  const resetForm = () => { setEditing(null); setForm({ name: '', scope: 'own', perms: new Set() }); };
  const startEdit = (r: api.Role) => { setEditing(r.id); setForm({ name: r.name, scope: r.scope, perms: new Set(r.permissions) }); setMsg(null); setErr(null); };
  const toggle = (key: string) => setForm((f) => { const p = new Set(f.perms); p.has(key) ? p.delete(key) : p.add(key); return { ...f, perms: p }; });

  const run = async (fn: () => Promise<any>, okMsg: string) => {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); await load(); setMsg(okMsg); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const onSave = () => {
    const permissions = [...form.perms];
    if (!editing && !form.name.trim()) { setErr('Enter a role name.'); return; }
    if (permissions.length === 0) { setErr('Select at least one permission.'); return; }
    if (editing) run(() => api.updateRole(editing, { scope: form.scope, permissions }), 'Role updated.').then(resetForm);
    else run(() => api.createRole({ name: form.name.trim(), scope: form.scope, permissions }), 'Role created.').then(resetForm);
  };

  if (!operatorCan(me, 'roles.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'roles.manage');

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>Roles &amp; permissions</h1><p className="muted">Live role definitions — assigned to operators in Team &amp; access.</p></div>
      </div>
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      {msg && <div className="banner ok" style={{ marginBottom: 16 }}>{msg}</div>}
      {loading ? <div className="muted">Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Roles</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {roles.map((r) => (
                <div key={r.id} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div className="between">
                    <div>
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      {r.isSystem && <span className="pill" style={{ marginLeft: 8, fontSize: 11 }}>system</span>}
                      <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>scope: {r.scope}</span>
                    </div>
                    {canManage && !r.isSystem && (
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => startEdit(r)}>Edit</button>
                        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => api.deleteRole(r.id), 'Role deleted.')}>Delete</button>
                      </div>
                    )}
                  </div>
                  <div className="muted mono" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
                    {r.permissions.includes('*') ? 'all permissions (*)' : r.permissions.join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {canManage ? (
            <div className="panel">
              <div className="between"><h3 style={{ marginTop: 0 }}>{editing ? `Edit role — ${form.name}` : 'Create a role'}</h3>{editing && <button className="btn btn-secondary btn-sm" onClick={resetForm}>New</button>}</div>
              <div className="row" style={{ gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Name</label>
                  <input className="input" style={{ width: 180 }} value={form.name} disabled={!!editing} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Regional Manager" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Scope</label>
                  <select className="input" style={{ width: 200 }} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                    {SCOPES.map((sc) => <option key={sc.v} value={sc.v}>{sc.d}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label className="muted" style={{ fontSize: 12 }}>Permissions</label>
                {Object.entries(groups).map(([group, list]) => (
                  <div key={group} style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)' }}>{group}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                      {list.map((p) => {
                        const on = form.perms.has(p.key);
                        return (
                          <button key={p.key} type="button" onClick={() => toggle(p.key)}
                            style={{ padding: '5px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--brand)' : 'var(--border)'), background: on ? 'var(--brand-50)' : 'transparent', color: on ? 'var(--brand-700)' : 'var(--text)' }}>
                            {on ? '✓ ' : ''}{p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn" style={{ marginTop: 16 }} disabled={busy} onClick={onSave}>{editing ? 'Save changes' : 'Create role'}</button>
            </div>
          ) : <div className="panel muted">You need the “Create / edit roles” permission to manage roles.</div>}
        </div>
      )}
    </>
  );
}
