'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { admin, useAdmin, currentUser, roleOf, can, type Permission } from '@/lib/admin-store';

const NAV: { href: string; label: string; icon: Parameters<typeof Icon>[0]['name']; perm: Permission }[] = [
  { href: '/admin', label: 'Dashboard', icon: 'sparkle', perm: 'dashboard.view' },
  { href: '/admin/overview', label: 'Dashboard (live)', icon: 'sparkle', perm: 'dashboard.view' },
  { href: '/admin/users', label: 'Users', icon: 'users', perm: 'users.view' },
  { href: '/admin/team', label: 'Team & access', icon: 'users', perm: 'users.view' },
  { href: '/admin/roles', label: 'Roles & permissions', icon: 'shield', perm: 'roles.view' },
  { href: '/admin/roles-live', label: 'Roles (live)', icon: 'shield', perm: 'roles.view' },
  { href: '/admin/ipos', label: 'IPOs', icon: 'trending', perm: 'ipos.view' },
  { href: '/admin/catalog', label: 'IPO catalog (live)', icon: 'trending', perm: 'ipos.view' },
  { href: '/admin/bids', label: 'Bids', icon: 'doc', perm: 'bids.view' },
  { href: '/admin/applications', label: 'Applications (live)', icon: 'doc', perm: 'bids.view' },
  { href: '/admin/reports', label: 'Reports', icon: 'chart', perm: 'reports.view' },
  { href: '/admin/reports-live', label: 'Reports (live)', icon: 'chart', perm: 'reports.view' },
  { href: '/admin/audit', label: 'Audit log', icon: 'calendar', perm: 'audit.view' },
  { href: '/admin/audit-live', label: 'Audit log (live)', icon: 'calendar', perm: 'audit.view' },
  { href: '/admin/api-config', label: 'API configuration', icon: 'globe', perm: 'rails.manage' },
  { href: '/admin/rails-live', label: 'Exchange rails (live)', icon: 'globe', perm: 'rails.manage' },
  { href: '/admin/tenants', label: 'Tenants', icon: 'globe', perm: 'tenants.manage' },
  { href: '/admin/settings', label: 'Settings', icon: 'lock', perm: 'settings.manage' },
  { href: '/admin/integrations', label: 'Provider keys', icon: 'lock', perm: 'providers.manage' },
  { href: '/admin/system', label: 'System status', icon: 'globe', perm: 'dashboard.view' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '/admin';
  const state = useAdmin((s) => s);
  const me = currentUser(state);
  const role = roleOf(state, me);

  if (!me) return <AdminLogin />;

  const items = NAV.filter((n) => can(state, n.perm));

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="admin-logo">
          <img src="/icon.svg" alt="" width={30} height={30} style={{ borderRadius: 8 }} />
          <span className="n">Investo<span style={{ color: 'var(--gold-600)' }}>yard</span></span>
        </div>
        <nav className="admin-nav">
          <span className="sep">Manage</span>
          {items.map((n) => {
            const active = n.href === '/admin' ? path === '/admin' : path.startsWith(n.href);
            return (
              <a key={n.href} href={n.href} className={active ? 'active' : ''}>
                <Icon name={n.icon} size={17} /> {n.label}
              </a>
            );
          })}
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          <a href="/" className="admin-nav" style={{ padding: 0 }}><span style={{ padding: '10px 12px', color: 'var(--text-faint)', fontSize: 13 }}>← Back to site</span></a>
        </div>
      </aside>

      <div className="admin-body">
        <header className="admin-top">
          <span className="admin-role-pill">{role?.name ?? '—'}</span>
          <span className="muted" style={{ fontSize: 13 }}>{me.name}</span>
          <div style={{ flex: 1 }} />
          <label className="muted" style={{ fontSize: 13 }}>Preview as</label>
          <select
            className="input" style={{ padding: '7px 10px', fontSize: 13, minWidth: 170, width: 'auto' }}
            value={me.id} onChange={(e) => admin.signInAs(e.target.value)}
          >
            {state.users.filter((u) => u.status === 'active').map((u) => (
              <option key={u.id} value={u.id}>{u.name} · {roleOf(state, u)?.name}</option>
            ))}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => admin.signOut()}>Sign out</button>
        </header>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}

function AdminLogin() {
  const state = useAdmin((s) => s);
  const [email, setEmail] = useState('superadmin@investoyard.com');
  const [err, setErr] = useState(false);

  return (
    <div className="admin-login">
      <div className="al-brand">
        <div className="al-brand-in">
          <div className="al-badge"><img src="/icon.svg" alt="Investoyard" /></div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, marginTop: 20 }}>Investo<span style={{ color: 'var(--gold)' }}>yard</span></div>
          <h1 className="display" style={{ color: '#fff', fontSize: 40, marginTop: 16 }}>Control panel</h1>
          <p style={{ color: 'rgba(255,255,255,.78)', fontSize: 17, marginTop: 12, maxWidth: 380 }}>
            Manage users, roles &amp; permissions, IPOs, bids and reports — all in one place.
          </p>
          <ul className="al-points">
            {[['shield', 'Role-based access control'], ['users', 'Team & investor management'], ['trending', 'Live IPO & bid oversight'], ['chart', 'Reports with export']].map(([ic, t]) => (
              <li key={t}><span className="al-ic"><Icon name={ic as any} size={16} /></span> {t}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="al-form">
        <div className="al-card">
          <h2 style={{ marginBottom: 4 }}>Admin sign in</h2>
          <p className="muted" style={{ marginBottom: 20 }}>Sign in with your work email.</p>
          <div className="field">
            <label>Work email</label>
            <input className="input" value={email} onChange={(e) => { setEmail(e.target.value); setErr(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !admin.signInEmail(email)) setErr(true); }} placeholder="you@investoyard.com" />
          </div>
          <button className="btn btn-block btn-lg" onClick={() => { if (!admin.signInEmail(email)) setErr(true); }}>Sign in</button>
          {err && <div className="banner warn" style={{ marginTop: 12 }}>No active account for that email.</div>}
          <div className="banner info" style={{ marginTop: 16 }}>
            Demo — quick sign in:
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              {state.users.filter((u) => u.status === 'active').slice(0, 3).map((u) => (
                <button key={u.id} className="btn btn-secondary btn-sm" onClick={() => admin.signInAs(u.id)}>{roleOf(state, u)?.name}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
