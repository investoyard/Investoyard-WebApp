'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { fetchMe, clearOperator, operatorCan, type OperatorMe } from '@/lib/operator';

const NAV: { href: string; label: string; icon: Parameters<typeof Icon>[0]['name']; perm: string }[] = [
  { href: '/admin/overview', label: 'Dashboard', icon: 'sparkle', perm: 'dashboard.view' },
  { href: '/admin/applications', label: 'Applications', icon: 'doc', perm: 'bids.view' },
  { href: '/admin/catalog', label: 'IPO Catalog', icon: 'trending', perm: 'ipos.view' },
  { href: '/admin/tenants', label: 'Partners & Tenants', icon: 'globe', perm: 'tenants.manage' },
  { href: '/admin/team', label: 'Users & Access', icon: 'users', perm: 'users.view' },
  { href: '/admin/roles-live', label: 'Roles', icon: 'shield', perm: 'roles.view' },
  { href: '/admin/reports-live', label: 'Reports', icon: 'chart', perm: 'reports.view' },
  { href: '/admin/rails-live', label: 'Exchange Rails', icon: 'globe', perm: 'rails.manage' },
  { href: '/admin/integrations', label: 'Provider Keys', icon: 'lock', perm: 'providers.manage' },
  { href: '/admin/audit-live', label: 'Audit Log', icon: 'calendar', perm: 'audit.view' },
  { href: '/admin/system', label: 'System Status', icon: 'globe', perm: 'dashboard.view' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '/admin';
  const router = useRouter();
  const [me, setMe] = useState<OperatorMe | null | undefined>(undefined); // undefined = loading

  const isLogin = path === '/admin/login';

  useEffect(() => {
    if (isLogin) return;
    let alive = true;
    fetchMe().then((m) => {
      if (!alive) return;
      setMe(m);
      if (!m) router.replace('/admin/login');
      else if (path === '/admin') router.replace('/admin/overview');
    });
    return () => { alive = false; };
  }, [isLogin, path, router]);

  // The login page renders itself, outside the gated shell.
  if (isLogin) return <>{children}</>;

  if (me === undefined) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>Loading…</div>;
  if (!me) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>Redirecting to sign in…</div>;

  const items = NAV.filter((n) => operatorCan(me, n.perm));
  const roleLabel = me.isSuperAdmin ? 'Super Admin' : (me.memberships[0]?.role ?? 'Operator');
  const signOut = () => { clearOperator(); router.replace('/admin/login'); };

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
            const active = path.startsWith(n.href);
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
          <span className="admin-role-pill">{roleLabel}</span>
          <span className="muted" style={{ fontSize: 13 }}>{me.name} · {me.homeTenant.name}</span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary btn-sm" onClick={signOut}>Sign out</button>
        </header>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
