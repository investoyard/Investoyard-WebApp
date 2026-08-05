'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Field, FormActions, PasswordInput } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog, type ConfirmState } from '@/components/ui/Confirm';
import { RowMenu } from '@/components/ui/RowMenu';
import { usePagination } from '@/components/ui/Pagination';
import { useSort } from '@/components/ui/useSort';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

const TYPE_LABEL: Record<string, string> = { platform: 'Platform', direct: 'Direct', partner: 'Partner', branch: 'Branch' };

/** The user's "type", derived from home tenant + role. */
function userType(o: api.Operator): string {
  if (o.username === 'superadmin') return 'Super Admin';
  if (o.tenant.type === 'partner') return 'Partner';
  if (o.tenant.type === 'branch') return 'Partner Branch';
  return o.roles[0]?.role ?? 'Admin';
}

const blankNew = { username: '', name: '', email: '', mobile: '', password: '', tenantSlug: '', roleName: 'Admin' };

export default function AdminUsers() {
  const me = useOperator();
  const [ops, setOps] = useState<api.Operator[]>([]);
  const [tree, setTree] = useState<api.AdminTenant[]>([]);
  const [roles, setRoles] = useState<api.Role[]>([]);
  const [form, setForm] = useState({ ...blankNew });
  const [showAdd, setShowAdd] = useState(false);
  const [created, setCreated] = useState<{ username: string; temporaryPassword?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setOps(await api.fetchOperators()); setErr(null); } catch (e: any) { setErr(String(e?.message ?? e)); }
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const [o, t, r] = await Promise.all([api.fetchOperators(), api.fetchTree(), api.fetchRoles()]);
        setOps(o); setTree(t); setRoles(r);
        const first = t.find((x) => x.type !== 'platform') ?? t[0];
        setForm((f) => ({ ...f, tenantSlug: first?.slug ?? '' }));
      } catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setLoading(false); }
    })();
  }, []);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setErr(null);
    try { await fn(); await load(); } catch (e: any) { setErr(String(e?.message ?? e)); } finally { setBusy(false); }
  };

  const onCreate = async () => {
    if (!/^[A-Za-z0-9_.]{3,40}$/.test(form.username) || !form.name.trim() || !form.tenantSlug || !form.roleName) return setErr('Enter a valid username, name, tenant and role.');
    if (form.mobile && !/^\d{10}$/.test(form.mobile)) return setErr('Mobile must be 10 digits.');
    setBusy(true); setErr(null); setCreated(null);
    try {
      const res = await api.createOperator({
        username: form.username, name: form.name, tenantSlug: form.tenantSlug, roleName: form.roleName,
        password: form.password || undefined, email: form.email || undefined, mobile: form.mobile || undefined,
      });
      setCreated({ username: res.username, temporaryPassword: res.temporaryPassword });
      setForm({ ...blankNew, tenantSlug: form.tenantSlug }); setShowAdd(false); await load();
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const resetPassword = (o: api.Operator) => {
    const pw = typeof window !== 'undefined' ? window.prompt(`New password for ${o.username}:`) : '';
    if (pw) run(() => api.updateOperator(o.id, { password: pw }));
  };
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const toggleActive = (o: api.Operator) => {
    if (o.status !== 'active') return run(() => api.updateOperator(o.id, { status: 'active' }));
    setConfirm({
      title: `Deactivate ${o.username}?`, danger: true, confirmLabel: 'Deactivate',
      message: <>This operator won’t be able to sign in until reactivated.</>,
      onConfirm: () => run(() => api.updateOperator(o.id, { status: 'inactive' })),
    });
  };

  const { apply, Th } = useSort<api.Operator>((o, k) => {
    switch (k) {
      case 'username': return o.username;
      case 'name': return (o.name ?? '').toLowerCase();
      case 'type': return userType(o);
      case 'belongs': return o.tenant.name.toLowerCase();
      case 'status': return o.status;
      default: return '';
    }
  });
  const { slice, node: pager } = usePagination(apply(ops), 10);

  if (!operatorCan(me, 'users.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'users.manage');

  return (
    <>
      <PageHead
        title="Users & access"
        sub={`Operators across your network — ${ops.length}. Types: Super Admin · Admin · Staff · Partner · Partner Branch.`}
        actions={canManage ? <button className="btn" onClick={() => { setShowAdd(true); setCreated(null); setErr(null); }}>＋ Add user</button> : undefined}
      />
      {err && !showAdd && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      {created && (
        <div className="banner ok" style={{ marginBottom: 16 }}>
          Created <b className="mono">{created.username}</b>.
          {created.temporaryPassword ? <> Temporary password: <b className="mono">{created.temporaryPassword}</b> — share it securely.</> : <> Password set as provided.</>}
        </div>
      )}

      {loading ? <Loader /> : (
        <div className="card">
          <div className="card-head"><span className="t">Operators <span className="count-badge">{ops.length}</span></span></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr>
                <Th k="username" label="Username" /><Th k="name" label="Name" /><Th k="type" label="Type" />
                <th>Contact</th><Th k="belongs" label="Belongs to" /><th>Role · scope</th><Th k="status" label="Status" />
                {canManage && <th style={{ textAlign: 'right' }}>Action</th>}
              </tr></thead>
              <tbody>
                {ops.length === 0 ? <tr><td colSpan={8} className="muted" style={{ padding: 14 }}>No operators yet.</td></tr> :
                  slice.map((o) => (
                    <tr key={o.id}>
                      <td className="mono" style={{ fontWeight: 700 }}>{o.username}</td>
                      <td>{o.name}</td>
                      <td><span className="st brand">{userType(o)}</span></td>
                      <td style={{ fontSize: 12 }}>{o.email ?? <span className="muted">—</span>}{o.mobile && <div className="mono muted">{o.mobile}</div>}</td>
                      <td>{o.tenant.name}<div className="muted" style={{ fontSize: 11 }}>{TYPE_LABEL[o.tenant.type] ?? o.tenant.type}</div></td>
                      <td>{o.roles.map((r) => `${r.role} · ${r.scope}`).join(', ') || '—'}</td>
                      <td><span className={`st ${o.status === 'active' ? 'ok' : 'mut'}`}>{o.status}</span></td>
                      {canManage && (
                        <td>
                          <span className="row-actions">
                            <RowMenu>
                              {o.username !== 'superadmin' && (
                                <button className={o.status === 'active' ? 'danger' : ''} disabled={busy} onClick={() => toggleActive(o)}><Icon name="power" size={15} /> {o.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                              )}
                              <button disabled={busy} onClick={() => resetPassword(o)}><Icon name="key" size={15} /> Reset password</button>
                            </RowMenu>
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {pager}
        </div>
      )}

      {showAdd && (
        <Modal title="Add an operator" sub="A username/password login for your team, a partner or a branch." onClose={() => setShowAdd(false)} wide>
          {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Username" required><input className="input mono" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/[^A-Za-z0-9_.]/g, '').slice(0, 40) })} placeholder="jane.doe" /></Field>
            <Field label="Full name" required span={2}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@partner.com" /></Field>
            <Field label="Mobile"><input className="input mono" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="9876543210" /></Field>
            <Field label="Belongs to" required hint="Which team / partner / branch this login is for">
              <select className="input" value={form.tenantSlug} onChange={(e) => setForm({ ...form, tenantSlug: e.target.value })}>
                {tree.map((t) => <option key={t.id} value={t.slug}>{t.name} ({TYPE_LABEL[t.type] ?? t.type})</option>)}
              </select>
            </Field>
            <Field label="Role">
              <select className="input" value={form.roleName} onChange={(e) => setForm({ ...form, roleName: e.target.value })}>
                {Array.from(new Set(['Admin', 'Staff', ...roles.map((r) => r.name)])).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Password" hint="Blank → auto-generate (shown once)"><PasswordInput value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="auto-generate" /></Field>
          </div>
          <FormActions>
            <button className="btn" disabled={busy} onClick={onCreate}>{busy ? 'Adding…' : 'Add operator'}</button>
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
          </FormActions>
        </Modal>
      )}
      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
