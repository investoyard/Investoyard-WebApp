'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import * as api from '@/lib/tenants-admin';

const TYPE_LABEL: Record<string, string> = { platform: 'Operator', direct: 'Direct', partner: 'Partner', branch: 'Branch' };

export default function AdminUsers() {
  const me = useOperator();
  const [ops, setOps] = useState<api.Operator[]>([]);
  const [tree, setTree] = useState<api.AdminTenant[]>([]);
  const [roles, setRoles] = useState<api.Role[]>([]);
  const [form, setForm] = useState({ username: '', name: '', tenantSlug: '', roleName: 'Admin', password: '' });
  const [created, setCreated] = useState<{ username: string; temporaryPassword?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setOps(await api.fetchOperators()); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const [o, t, r] = await Promise.all([api.fetchOperators(), api.fetchTree(), api.fetchRoles()]);
        setOps(o); setTree(t); setRoles(r);
        const firstManageable = t.find((x) => x.type !== 'platform') ?? t[0];
        setForm((f) => ({ ...f, tenantSlug: firstManageable?.slug ?? '' }));
      } catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setLoading(false); }
    })();
  }, []);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setErr(null);
    try { await fn(); await load(); } catch (e: any) { setErr(String(e?.message ?? e)); } finally { setBusy(false); }
  };

  const onCreate = async () => {
    if (!/^[A-Za-z0-9_.]{3,40}$/.test(form.username) || !form.name.trim() || !form.tenantSlug || !form.roleName) {
      setErr('Enter a username (3–40, letters/digits/._), name, tenant and role.'); return;
    }
    setBusy(true); setErr(null); setCreated(null);
    try {
      const res = await api.createOperator({
        username: form.username, name: form.name, tenantSlug: form.tenantSlug, roleName: form.roleName,
        password: form.password || undefined,
      });
      setCreated({ username: res.username, temporaryPassword: res.temporaryPassword });
      setForm((f) => ({ ...f, username: '', name: '', password: '' }));
      await load();
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const resetPassword = (o: api.Operator) => {
    const pw = typeof window !== 'undefined' ? window.prompt(`New password for ${o.username}:`) : '';
    if (pw) run(() => api.updateOperator(o.id, { password: pw }));
  };

  if (!operatorCan(me, 'users.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'users.manage');

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>Users &amp; access</h1><p className="muted">Operator accounts across your tenants — {ops.length} user(s).</p></div>
      </div>
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      {created && (
        <div className="banner info" style={{ marginBottom: 16 }}>
          Created <b className="mono">{created.username}</b>.
          {created.temporaryPassword
            ? <> Temporary password: <b className="mono">{created.temporaryPassword}</b> — share it securely; they should change it.</>
            : <> Password set as provided.</>}
        </div>
      )}
      {loading ? <div className="muted">Loading…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel">
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th>Username</th><th>Name</th><th>Tenant</th><th>Role · scope</th><th>Status</th>{canManage && <th></th>}</tr></thead>
                <tbody>
                  {ops.length === 0 ? <tr><td colSpan={6} className="muted" style={{ padding: 14 }}>No operators yet.</td></tr> :
                    ops.map((o) => (
                      <tr key={o.id}>
                        <td className="mono" style={{ fontWeight: 600 }}>{o.username}</td>
                        <td>{o.name}</td>
                        <td>{o.tenant.name}<div className="muted" style={{ fontSize: 11 }}>{TYPE_LABEL[o.tenant.type] ?? o.tenant.type}</div></td>
                        <td>{o.roles.map((r) => `${r.role} · ${r.scope}`).join(', ') || '—'}</td>
                        <td><span className="pill" style={{ background: o.status === 'active' ? '#eaf5ee' : 'var(--bg-subtle)', color: o.status === 'active' ? 'var(--good, #1a7f4b)' : 'var(--text-faint)' }}>{o.status}</span></td>
                        {canManage && (
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {o.username !== 'superadmin' && (
                              <button className="btn btn-secondary btn-sm" disabled={busy}
                                onClick={() => run(() => api.updateOperator(o.id, { status: o.status === 'active' ? 'inactive' : 'active' }))}>
                                {o.status === 'active' ? 'Deactivate' : 'Activate'}
                              </button>
                            )}{' '}
                            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => resetPassword(o)}>Reset password</button>
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {canManage && (
            <div className="panel">
              <h3 style={{ marginTop: 0 }}>Add an operator</h3>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <F label="Username"><input className="input mono" style={{ width: 150 }} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/[^A-Za-z0-9_.]/g, '').slice(0, 40) })} /></F>
                <F label="Name"><input className="input" style={{ width: 180 }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
                <F label="Tenant"><select className="input" style={{ width: 190 }} value={form.tenantSlug} onChange={(e) => setForm({ ...form, tenantSlug: e.target.value })}>
                  {tree.map((t) => <option key={t.id} value={t.slug}>{t.name} ({TYPE_LABEL[t.type] ?? t.type})</option>)}
                </select></F>
                <F label="Role"><select className="input" style={{ width: 140 }} value={form.roleName} onChange={(e) => setForm({ ...form, roleName: e.target.value })}>
                  {Array.from(new Set(['Admin', ...roles.map((r) => r.name)])).map((n) => <option key={n} value={n}>{n}</option>)}
                </select></F>
                <F label="Password (optional)"><input className="input mono" style={{ width: 160 }} type="password" placeholder="auto-generate" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></F>
                <button className="btn" disabled={busy} onClick={onCreate}>Add operator</button>
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Leave the password blank to auto-generate a temporary one (shown once). The role must exist on the chosen tenant.</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><label className="muted" style={{ fontSize: 11 }}>{label}</label>{children}</div>;
}
