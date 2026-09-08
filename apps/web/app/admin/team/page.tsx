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

/** A role name is SuperAdmin-equivalent when its Role row carries '*' OR
 *  scope='all'. The catalog Role list carries that info; if the role
 *  isn't in the fetched list (e.g. partner admin without roles.view),
 *  fall back to the classic name "SuperAdmin". */
function isSuperAdminRoleName(name: string, roles: import('@/lib/tenants-admin').Role[]): boolean {
  const r = roles.find((x) => x.name === name);
  if (r) return r.permissions.includes('*') || r.scope === 'all';
  return name === 'SuperAdmin';
}

/**
 * Cut the full tenant tree down to what this operator can add operators
 * for. Superadmin sees everything; anyone else sees their home tenant
 * plus every descendant below it. Mirrors the server's own scope check
 * on POST /admin/operators — showing tenants the operator would be
 * refused for is a bad UX (they click, get 403). Superadmin is
 * identified by isSuperAdmin OR by holding tenants.manage on a role
 * with scope='all' (the platform Admin), same as the sidebar test.
 */
function scopeTree(all: api.AdminTenant[], me: import('@/lib/operator').OperatorMe | null | undefined): api.AdminTenant[] {
  if (!me) return [];
  const platformScope = me.isSuperAdmin || me.memberships.some((m) => m.scope === 'all');
  if (platformScope) return all;

  // Membership tenants are the operator's home + any others they hold a
  // role on. For each such tenant, include it AND every descendant.
  const owned = new Set(
    all
      .filter((t) => me.memberships.some((m) => m.tenantSlug === t.slug))
      .map((t) => t.id),
  );
  // Walk children up to a bounded depth so a cycle (should not exist)
  // can't hang the loader.
  const byParent = new Map<string, api.AdminTenant[]>();
  for (const t of all) {
    if (!t.parentId) continue;
    const list = byParent.get(t.parentId) ?? [];
    list.push(t);
    byParent.set(t.parentId, list);
  }
  const visit = (id: string, depth = 0) => {
    if (depth > 6) return;
    for (const child of byParent.get(id) ?? []) {
      if (owned.has(child.id)) continue;
      owned.add(child.id);
      visit(child.id, depth + 1);
    }
  };
  for (const id of Array.from(owned)) visit(id);
  return all.filter((t) => owned.has(t.id));
}

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
      // Load the three independently. Combining them in a Promise.all made
      // a 403 on fetchRoles (partner admin tier lacks roles.view) reject
      // the whole batch — tree never got set and the Add User dropdown
      // rendered blank. allSettled lets each succeed on its own; the role
      // dropdown already falls back to Admin/Staff when the fetched list
      // is empty, so a failed fetchRoles is invisible to the operator.
      const [oRes, tRes, rRes] = await Promise.allSettled([
        api.fetchOperators(), api.fetchTree(), api.fetchRoles(),
      ]);
      if (oRes.status === 'fulfilled') setOps(oRes.value);
      let scopedTree: api.AdminTenant[] = [];
      if (tRes.status === 'fulfilled') {
        // Scope the dropdown to what this operator can actually own users
        // for. Superadmin (or a role with 'tenants.manage' at platform
        // scope) sees every tenant; a partner-tier admin sees their own
        // home tenant + any branches under it. Server-side add-operator
        // enforces the same, but showing the whole tree here would let a
        // partner click a tenant only to see it fail on submit.
        scopedTree = scopeTree(tRes.value, me);
        setTree(scopedTree);
        const first = scopedTree.find((x) => x.type !== 'platform') ?? scopedTree[0];
        setForm((f) => ({ ...f, tenantSlug: first?.slug ?? '' }));
      }
      if (rRes.status === 'fulfilled') setRoles(rRes.value);
      // Only report an error to the operator if the load they'd actually
      // notice failed — the operators list itself.
      if (oRes.status === 'rejected') setErr(String((oRes.reason as any)?.message ?? oRes.reason));
      setLoading(false);
    })();
  }, [me]);

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

  // Edit modal — updateOperator supports name, email, mobile, role. Server
  // enforces: 1-Admin rule for partner tenants; SuperAdmin assignment
  // limited to superadmin callers; self-role-edit refused.
  const [editOp, setEditOp] = useState<{ o: api.Operator; name: string; email: string; mobile: string; roleName: string } | null>(null);
  const openEdit = (o: api.Operator) => setEditOp({
    o,
    name: o.name ?? '',
    email: o.email ?? '',
    mobile: o.mobile ?? '',
    roleName: o.roles[0]?.role ?? 'Admin',
  });
  const saveEdit = async () => {
    if (!editOp) return;
    setBusy(true); setErr(null);
    try {
      // Only send role if it actually changed — server refuses a self-role-
      // edit and 1-Admin rule kicks in if we sent it needlessly.
      const patch: any = {
        name: editOp.name.trim(),
        email: editOp.email.trim() || null,
        mobile: editOp.mobile.trim() || null,
      };
      const currentRole = editOp.o.roles[0]?.role ?? '';
      if (editOp.roleName && editOp.roleName !== currentRole) patch.roleName = editOp.roleName;
      await api.updateOperator(editOp.o.id, patch);
      setEditOp(null);
      await load();
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
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
                              <button disabled={busy} onClick={() => openEdit(o)}>
                                <Icon name="edit" size={15} /> Edit user
                              </button>
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
            {(() => {
              // Enforce "one Admin per partner/branch/white-label" in the
              // UI. Platform tenants may have many Admins (the operator
              // team). The server enforces this too — the client-side
              // hide is just so an operator doesn't pick a role that
              // will 409 on submit.
              const targetTenant = tree.find((t) => t.slug === form.tenantSlug);
              const isPlatform = targetTenant?.type === 'platform';
              const adminAlreadyExists = !isPlatform && ops.some(
                (o) => o.tenant.slug === form.tenantSlug &&
                       o.status === 'active' &&
                       o.roles.some((r) => r.role === 'Admin'),
              );
              // Auto-flip the pending selection to Staff so the operator
              // never lands on the disallowed value.
              if (adminAlreadyExists && form.roleName === 'Admin') {
                queueMicrotask(() => setForm((f) => f.roleName === 'Admin' ? { ...f, roleName: 'Staff' } : f));
              }
              const options = Array.from(new Set(['Admin', 'Staff', ...roles.map((r) => r.name)]))
                .filter((n) => !(adminAlreadyExists && n === 'Admin'))
                // Only a superadmin may assign a SuperAdmin-equivalent role
                // (server enforces same). Hide the option from the dropdown
                // so nobody picks a value that would 403 on submit.
                .filter((n) => me?.isSuperAdmin || !isSuperAdminRoleName(n, roles));
              return (
                <Field label="Role" hint={adminAlreadyExists ? `${targetTenant?.name} already has an Admin — only Staff can be added` : undefined}>
                  <select className="input" value={form.roleName} onChange={(e) => setForm({ ...form, roleName: e.target.value })}>
                    {options.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
              );
            })()}
            <Field label="Password" hint="Blank → auto-generate (shown once)"><PasswordInput value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="auto-generate" /></Field>
          </div>
          <FormActions>
            <button className="btn" disabled={busy} onClick={onCreate}>{busy ? 'Adding…' : 'Add operator'}</button>
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
          </FormActions>
        </Modal>
      )}
      {editOp && (() => {
        // Same 1-Admin rule as the Add dialog: if the target tenant
        // already has an Admin and it's not THIS user, hide Admin from
        // the dropdown. Also hide SuperAdmin unless caller is superadmin.
        const targetSlug = editOp.o.tenant.slug;
        const targetType = editOp.o.tenant.type;
        const isPlatform = targetType === 'platform';
        const otherAdminExists = !isPlatform && ops.some(
          (o) => o.id !== editOp.o.id &&
                 o.tenant.slug === targetSlug &&
                 o.status === 'active' &&
                 o.roles.some((r) => r.role === 'Admin'),
        );
        const selfEdit = editOp.o.id === me?.id;
        const options = Array.from(new Set(['Admin', 'Staff', ...roles.map((r) => r.name)]))
          .filter((n) => !(otherAdminExists && n === 'Admin'))
          .filter((n) => me?.isSuperAdmin || !isSuperAdminRoleName(n, roles));
        return (
          <Modal title="Edit user" sub={`${editOp.o.username}${editOp.o.name ? ` — ${editOp.o.name}` : ''}`} onClose={() => setEditOp(null)}>
            {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}
            <div className="form-grid">
              <Field label="Username" hint="Username is fixed — change requires a new operator">
                <input className="input mono" value={editOp.o.username} disabled />
              </Field>
              <Field label="Full name" required span={2}>
                <input className="input" value={editOp.name} onChange={(e) => setEditOp({ ...editOp, name: e.target.value })} />
              </Field>
              <Field label="Email">
                <input className="input" type="email" value={editOp.email} onChange={(e) => setEditOp({ ...editOp, email: e.target.value })} placeholder="jane@partner.com" />
              </Field>
              <Field label="Mobile">
                <input className="input mono" value={editOp.mobile} onChange={(e) => setEditOp({ ...editOp, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="9876543210" />
              </Field>
              <Field label="Belongs to">
                <input className="input" value={`${editOp.o.tenant.name} (${TYPE_LABEL[editOp.o.tenant.type] ?? editOp.o.tenant.type})`} disabled />
              </Field>
              <Field label="Role" hint={
                selfEdit ? 'You cannot change your own role — ask another operator.'
                  : otherAdminExists ? `${editOp.o.tenant.name} already has another Admin — this user can be Staff.`
                  : undefined
              }>
                <select className="input" value={editOp.roleName} onChange={(e) => setEditOp({ ...editOp, roleName: e.target.value })} disabled={selfEdit}>
                  {options.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
            </div>
            <FormActions>
              <button className="btn" disabled={busy} onClick={() => void saveEdit()}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
              <button className="btn btn-secondary" onClick={() => setEditOp(null)}>Cancel</button>
            </FormActions>
          </Modal>
        );
      })()}

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
