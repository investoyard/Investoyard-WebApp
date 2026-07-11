'use client';
import { useState } from 'react';
import { admin, useAdmin, can, roleName, type AdminUser } from '@/lib/admin-store';
import { NoAccess, Modal } from '@/components/AdminUI';

const blank = { name: '', email: '', roleId: '', status: 'active' as const };

export default function AdminUsers() {
  const s = useAdmin((x) => x);
  const manage = can(s, 'users.manage');
  const [q, setQ] = useState('');
  const [fRole, setFRole] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [edit, setEdit] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);

  if (!can(s, 'users.view')) return <NoAccess />;

  const ql = q.trim().toLowerCase();
  const rows = s.users.filter((u) => {
    if (fRole !== 'all' && u.roleId !== fRole) return false;
    if (fStatus !== 'all' && u.status !== fStatus) return false;
    if (ql && !(`${u.name} ${u.email}`.toLowerCase().includes(ql))) return false;
    return true;
  });
  const hasFilter = q || fRole !== 'all' || fStatus !== 'all';

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>Users</h1><p className="muted">{s.users.length} accounts</p></div>
        {manage && <button className="btn" onClick={() => setCreating(true)}>+ Add user</button>}
      </div>

      <div className="filters">
        <div className="fg" style={{ flex: '2 1 220px' }}>
          <label>Search</label>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email…" />
        </div>
        <div className="fg"><label>Role</label>
          <select className="input" value={fRole} onChange={(e) => setFRole(e.target.value)}>
            <option value="all">All roles</option>{s.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="fg"><label>Status</label>
          <select className="input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="all">All</option><option value="active">Active</option><option value="disabled">Disabled</option>
          </select>
        </div>
        {hasFilter && <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setFRole('all'); setFStatus('all'); }}>Clear</button>}
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th>{manage && <th></th>}</tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td className="muted">{u.email}</td>
                <td><span className="pill-role">{roleName(s, u.roleId)}</span></td>
                <td><span className={u.status === 'active' ? 'pill-on' : 'pill-off'}>{u.status}</span></td>
                <td className="muted mono">{u.createdAt}</td>
                {manage && (
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEdit(u)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => admin.toggleUser(u.id)}>{u.status === 'active' ? 'Disable' : 'Enable'}</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && <UserForm title="Add user" initial={blank} onClose={() => setCreating(false)} onSave={(v) => { admin.createUser(v); setCreating(false); }} />}
      {edit && <UserForm title="Edit user" initial={edit} onClose={() => setEdit(null)} onSave={(v) => { admin.updateUser(edit.id, v); setEdit(null); }} />}
    </>
  );
}

function UserForm({ title, initial, onClose, onSave }: {
  title: string; initial: Partial<AdminUser>; onClose: () => void; onSave: (v: { name: string; email: string; roleId: string; status: 'active' | 'disabled' }) => void;
}) {
  const s = useAdmin((x) => x);
  const [name, setName] = useState(initial.name ?? '');
  const [email, setEmail] = useState(initial.email ?? '');
  const [roleId, setRoleId] = useState(initial.roleId || s.roles[0]?.id || '');
  const [status, setStatus] = useState<'active' | 'disabled'>((initial.status as any) ?? 'active');
  const valid = name.trim() && /\S+@\S+\.\S+/.test(email) && roleId;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="field"><label>Full name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label>Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@investoyard.com" /></div>
      <div className="cols-2">
        <div className="field"><label>Role</label>
          <select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {s.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="active">Active</option><option value="disabled">Disabled</option>
          </select>
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!valid} onClick={() => onSave({ name: name.trim(), email: email.trim(), roleId, status })}>Save</button>
      </div>
    </Modal>
  );
}
