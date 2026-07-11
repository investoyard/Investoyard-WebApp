'use client';
import { useMemo, useState } from 'react';
import { admin, useAdmin, can, PERMISSIONS, type Permission, type Role } from '@/lib/admin-store';
import { NoAccess, Modal } from '@/components/AdminUI';

export default function AdminRoles() {
  const s = useAdmin((x) => x);
  const manage = can(s, 'roles.manage');
  const [edit, setEdit] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  if (!can(s, 'roles.view')) return <NoAccess />;

  const usersByRole = (roleId: string) => s.users.filter((u) => u.roleId === roleId).length;

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>Roles &amp; permissions</h1><p className="muted">{s.roles.length} roles · {PERMISSIONS.length} permissions</p></div>
        {manage && <button className="btn" onClick={() => setCreating(true)}>+ Create role</button>}
      </div>

      <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%,300px),1fr))' }}>
        {s.roles.map((r) => (
          <div className="panel" key={r.id}>
            <div className="between">
              <h3>{r.name}</h3>
              {r.system ? <span className="pill-off">system</span> : <span className="pill-role">custom</span>}
            </div>
            <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              {r.permissions.length} permission{r.permissions.length !== 1 ? 's' : ''} · {usersByRole(r.id)} user{usersByRole(r.id) !== 1 ? 's' : ''}
            </p>
            {manage && (
              <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                {!r.system && usersByRole(r.id) === 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => admin.deleteRole(r.id)}>Delete</button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => setEdit(r)}>Edit permissions</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {creating && <RoleForm title="Create role" onClose={() => setCreating(false)} onSave={(name, perms) => { admin.createRole(name, perms); setCreating(false); }} />}
      {edit && <RoleForm title={`Edit — ${edit.name}`} role={edit} onClose={() => setEdit(null)} onSave={(name, perms) => { admin.updateRole(edit.id, { name, permissions: perms }); setEdit(null); }} />}
    </>
  );
}

function RoleForm({ title, role, onClose, onSave }: {
  title: string; role?: Role; onClose: () => void; onSave: (name: string, perms: Permission[]) => void;
}) {
  const [name, setName] = useState(role?.name ?? '');
  const [perms, setPerms] = useState<Permission[]>(role?.permissions ?? ['dashboard.view']);
  const locked = role?.name === 'SuperAdmin'; // don't let anyone strip SuperAdmin

  const groups = useMemo(() => {
    const g: Record<string, typeof PERMISSIONS[number][]> = {};
    PERMISSIONS.forEach((p) => { (g[p.group] ??= []).push(p); });
    return Object.entries(g);
  }, []);

  const toggle = (k: Permission) => setPerms((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  return (
    <Modal title={title} onClose={onClose}>
      <div className="field"><label>Role name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Compliance, Support" disabled={locked} />
      </div>
      <div className="perm-groups">
        {groups.map(([group, items]) => (
          <div className="perm-group" key={group}>
            <div className="pg-t">{group}</div>
            {items.map((p) => (
              <label className="perm-item" key={p.key}>
                <input type="checkbox" checked={perms.includes(p.key)} disabled={locked} onChange={() => toggle(p.key)} />
                {p.label} <span className="faint mono" style={{ fontSize: 11 }}>{p.key}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!name.trim() || locked} onClick={() => onSave(name.trim(), perms)}>Save</button>
      </div>
      {locked && <p className="disclaimer">SuperAdmin permissions can’t be edited.</p>}
    </Modal>
  );
}
