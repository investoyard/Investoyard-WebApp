'use client';
import { useCallback, useEffect, useState } from 'react';
import { can, useAdmin } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';
import * as api from '@/lib/tenants-admin';

const TYPE_LABEL: Record<string, string> = { platform: 'Operator', direct: 'Direct (B2C)', partner: 'Partner', branch: 'Branch' };

export default function AdminTeam() {
  const s = useAdmin((x) => x);
  const [tree, setTree] = useState<api.AdminTenant[]>([]);
  const [roles, setRoles] = useState<api.Role[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [members, setMembers] = useState<api.Member[]>([]);
  const [form, setForm] = useState({ mobile: '', name: '', roleName: '' });
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadMembers = useCallback(async (slug: string) => {
    try { setMembers(await api.fetchMembers(slug)); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); setMembers([]); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [t, r] = await Promise.all([api.fetchTree(), api.fetchRoles()]);
        setTree(t); setRoles(r);
        setForm((f) => ({ ...f, roleName: r.find((x) => x.name === 'BranchUser')?.name ?? r[0]?.name ?? '' }));
        const first = t.find((x) => x.type !== 'platform') ?? t[0];
        if (first) { setSel(first.slug); await loadMembers(first.slug); }
      } catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setLoading(false); }
    })();
  }, [loadMembers]);

  const select = async (slug: string) => { setSel(slug); await loadMembers(slug); };

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setErr(null);
    try { await fn(); if (sel) await loadMembers(sel); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const onAdd = () => {
    if (!sel || !/^\d{10}$/.test(form.mobile) || !form.roleName) { setErr('Enter a 10-digit mobile and pick a role.'); return; }
    run(async () => { await api.addMember(sel, { mobile: form.mobile, name: form.name || undefined, roleName: form.roleName }); setForm((f) => ({ ...f, mobile: '', name: '' })); });
  };

  if (!can(s, 'users.view')) return <NoAccess />;

  const selected = tree.find((t) => t.slug === sel);
  const childrenOf = (pid: string | null) => tree.filter((t) => t.parentId === pid);
  const roots = tree.filter((t) => !t.parentId || !tree.some((x) => x.id === t.parentId));
  const renderNode = (t: api.AdminTenant, depth: number): React.ReactNode => (
    <div key={t.id}>
      <button onClick={() => select(t.slug)} style={{
        width: '100%', textAlign: 'left', padding: '9px 12px', paddingLeft: 12 + depth * 20, border: 'none',
        borderRadius: 10, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center',
        background: sel === t.slug ? 'var(--brand-50)' : 'transparent',
        boxShadow: sel === t.slug ? 'inset 0 0 0 1px var(--brand-200)' : 'none',
      }}>
        <span style={{ width: 8, height: 8, borderRadius: 3, background: t.brandColor ?? 'var(--border-2)' }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
        <span className="muted" style={{ fontSize: 12 }}>{TYPE_LABEL[t.type] ?? t.type}</span>
      </button>
      {childrenOf(t.id).map((c) => renderNode(c, depth + 1))}
    </div>
  );

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>Team &amp; access</h1><p className="muted">Operators, roles &amp; tenant scope — live from the API.</p></div>
      </div>
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      {loading ? <div className="muted">Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 20, alignItems: 'start' }}>
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Tenant</h3>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>{roots.map((r) => renderNode(r, 0))}</div>
          </div>

          <div className="panel">
            <h3 style={{ marginTop: 0 }}>{selected?.name} — operators</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', marginTop: 8 }}>
                <thead><tr><th>Name</th><th>Mobile</th><th>Role</th><th>Tenant</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {members.length === 0 ? <tr><td colSpan={6} className="muted" style={{ padding: 14 }}>No operators yet.</td></tr> :
                    members.map((m) => (
                      <tr key={m.membershipId}>
                        <td>{m.name ?? '—'}</td>
                        <td className="mono">{m.mobile}</td>
                        <td>
                          <select className="input" style={{ padding: '5px 8px', fontSize: 13 }} value={m.roleName} disabled={busy}
                            onChange={(e) => run(() => api.updateMember(m.tenantSlug, m.membershipId, { roleName: e.target.value }))}>
                            {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                          </select>
                        </td>
                        <td className="muted">{m.tenantSlug}</td>
                        <td><span className="pill" style={{ background: m.status === 'active' ? '#eaf5ee' : 'var(--bg-subtle)', color: m.status === 'active' ? 'var(--good, #1a7f4b)' : 'var(--text-faint)' }}>{m.status}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-secondary btn-sm" disabled={busy}
                            onClick={() => run(() => api.updateMember(m.tenantSlug, m.membershipId, { status: m.status === 'active' ? 'inactive' : 'active' }))}>
                            {m.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Add operator to {selected?.name}</div>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="input mono" style={{ width: 150 }} placeholder="10-digit mobile" value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
                <input className="input" style={{ width: 170 }} placeholder="Name (optional)" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <select className="input" style={{ width: 150 }} value={form.roleName} onChange={(e) => setForm({ ...form, roleName: e.target.value })}>
                  {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
                <button className="btn" disabled={busy} onClick={onAdd}>Add</button>
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>They sign in via OTP with that mobile; the role &amp; scope decide what they can manage.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
