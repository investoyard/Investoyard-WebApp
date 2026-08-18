'use client';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { ConfirmDialog } from '@/components/ui/Confirm';
import { Loader } from '@/components/ui/Loader';
import { fetchIpos } from '@/lib/tenants-admin';
import { ipoPhase, daysUntil } from '@/lib/format';
import { fetchMe, clearOperator, operatorCan, type OperatorMe } from '@/lib/operator';
import { OperatorContext } from '@/lib/operator-context';

type Notif = { id: string; tone: 'warn' | 'brand' | 'ok'; icon: Parameters<typeof Icon>[0]['name']; text: string; sub: string };

type IconName = Parameters<typeof Icon>[0]['name'];
type NavLeaf = { href: string; label: string; perm?: string };
type NavNode = { key: string; label: string; icon: IconName; perm?: string; href?: string; children?: NavLeaf[] };

// Menu taxonomy — matches the operator's IPO-console design. Real pages where we have
// them; the rest open a clean "coming soon" page so the full structure is always present.
const NAV: NavNode[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'home', href: '/admin/overview', perm: 'dashboard.view' },
  { key: 'ipo', label: 'IPO Management', icon: 'box', perm: 'ipos.view', children: [
    { href: '/admin/catalog', label: 'IPO List' },
    { href: '/admin/catalog/new', label: 'Add New IPO', perm: 'ipos.manage' },
    { href: '/admin/catalog/operations', label: 'IPO Operations', perm: 'ipos.manage' },
    { href: '/admin/masters/ipo-category', label: 'IPO Category' },
    { href: '/admin/masters/price-band', label: 'Price Band Master' },
  ] },
  { key: 'applications', label: 'Applications', icon: 'list', href: '/admin/applications', perm: 'bids.view' },
  { key: 'bidding', label: 'Bidding & Exchange', icon: 'exchange', perm: 'rails.manage', children: [
    { href: '/admin/rails-live', label: 'Exchange Rails' },
    { href: '/admin/bidding/queue', label: 'Bid Queue' },
    { href: '/admin/bidding/failed', label: 'Failed / Retry' },
  ] },
  { key: 'upi', label: 'UPI / Payments', icon: 'rupee', children: [
    { href: '/admin/upi/pending', label: 'Pending' },
    { href: '/admin/upi/success', label: 'Success' },
    { href: '/admin/upi/failed', label: 'Failed' },
    { href: '/admin/upi/expired', label: 'Expired' },
  ] },
  { key: 'clients', label: 'Clients', icon: 'users', href: '/admin/clients', perm: 'clients.view' },
  { key: 'partners', label: 'Partners / Branches', icon: 'sitemap', href: '/admin/tenants', perm: 'tenants.manage' },
  { key: 'reports', label: 'Reports', icon: 'chart', href: '/admin/reports-live', perm: 'reports.view' },
  { key: 'banners', label: 'Banners', icon: 'sparkle', href: '/admin/banners', perm: 'ipos.view' },
  { key: 'allotment', label: 'Allotment', icon: 'receipt', children: [
    { href: '/admin/allotment/import', label: 'Import Allotment' },
    { href: '/admin/allotment/list', label: 'Allotment List' },
  ] },
  { key: 'refund', label: 'Refund / Demat', icon: 'bank', children: [
    { href: '/admin/refund/refunds', label: 'Refunds' },
    { href: '/admin/refund/demat', label: 'Demat Credit' },
  ] },
  { key: 'partner-api', label: 'Partner API', icon: 'key', children: [
    { href: '/admin/partner-api/docs', label: 'API Docs' },
    { href: '/admin/partner-api/calls', label: 'API Calls' },
    { href: '/admin/partner-api/prints', label: 'Print Report' },
  ] },
  { key: 'masters', label: 'Masters', icon: 'layers', children: [
    { href: '/admin/masters/registrars', label: 'Registrars' },
    { href: '/admin/masters/lead-managers', label: 'Lead Managers' },
    { href: '/admin/masters/relationships', label: 'Relationships' },
    { href: '/admin/masters/upi-handles', label: 'UPI Handles' },
    { href: '/admin/masters/exchanges', label: 'Exchanges' },
  ] },
  { key: 'users', label: 'User Management', icon: 'shield', perm: 'users.view', children: [
    { href: '/admin/team', label: 'Users' },
    { href: '/admin/roles-live', label: 'Roles & Permissions', perm: 'roles.view' },
    { href: '/admin/audit-live', label: 'Audit Trail', perm: 'audit.view' },
  ] },
  { key: 'settings', label: 'System Settings', icon: 'settings', children: [
    { href: '/admin/integrations', label: 'Provider Keys', perm: 'providers.manage' },
    { href: '/admin/templates', label: 'Message Templates', perm: 'providers.manage' },
    { href: '/admin/chatbot', label: 'Chatbot Flow', perm: 'providers.manage' },
    { href: '/admin/system', label: 'System Status', perm: 'dashboard.view' },
  ] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '/admin';
  const router = useRouter();
  const [me, setMe] = useState<OperatorMe | null | undefined>(undefined); // undefined = loading
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [askLogout, setAskLogout] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null); // accordion: user-opened group ('' = force-closed)
  const [flyout, setFlyout] = useState<string | null>(null);   // collapsed-mode submenu popover
  const [flyPos, setFlyPos] = useState<{ top: number; left: number } | null>(null); // fixed anchor (lets the rail scroll)
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(typeof localStorage !== 'undefined' && localStorage.getItem('iy_admin_collapsed') === '1'); }, []);
  const toggleCollapsed = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem('iy_admin_collapsed', n ? '1' : '0'); } catch { /* ignore */ } return n; });

  useEffect(() => {
    const saved = (typeof localStorage !== 'undefined' ? localStorage.getItem('iy_admin_theme') : null) as 'light' | 'dark' | null;
    const initial = saved === 'dark' ? 'dark' : 'light';
    setTheme(initial);
    document.documentElement.dataset.adminTheme = initial;
  }, []);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.adminTheme = next;
    try { localStorage.setItem('iy_admin_theme', next); } catch { /* ignore */ }
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  useEffect(() => {
    if (!menuOpen && !notifOpen && !flyout) return;
    const close = () => { setMenuOpen(false); setNotifOpen(false); setFlyout(null); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen, notifOpen, flyout]);

  // notifications: time-sensitive IPO alerts (distinct from the audit log)
  useEffect(() => {
    if ((path.replace(/\/+$/, '') || '/') === '/admin/login') return;
    fetchIpos().then((ipos) => {
      const out: Notif[] = [];
      for (const i of ipos) {
        const ph = ipoPhase(i);
        const dc = daysUntil(i.closeDate), don = daysUntil(i.openDate);
        const when = (d: number) => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);
        if (ph.phase === 'live' && dc != null && dc >= 0 && dc <= 3) out.push({ id: i.id + 'c', tone: 'warn', icon: 'clock', text: `${i.symbol} closes ${when(dc)}`, sub: i.name });
        else if (ph.phase === 'upcoming' && don != null && don >= 0 && don <= 3) out.push({ id: i.id + 'o', tone: 'brand', icon: 'calendar', text: `${i.symbol} opens ${when(don)}`, sub: i.name });
        else if (ph.phase === 'listed') out.push({ id: i.id + 'l', tone: 'ok', icon: 'check', text: `${i.symbol} has listed`, sub: i.name });
        else if (ph.phase === 'live') out.push({ id: i.id + 'v', tone: 'brand', icon: 'trending', text: `${i.symbol} is open for applications`, sub: i.name });
      }
      setNotifs(out.slice(0, 8));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // trailingSlash:true means pathname can end with "/" — normalise before comparing.
  const clean = path.replace(/\/+$/, '') || '/';
  const isLogin = clean === '/admin/login';

  // The single most-specific nav href that owns the current route (longest prefix wins,
  // so /admin/catalog/new highlights "Add New IPO", not "IPO List").
  const activeHref = useMemo(() => {
    const hrefs: string[] = [];
    for (const n of NAV) { if (n.href) hrefs.push(n.href); n.children?.forEach((c) => hrefs.push(c.href)); }
    return hrefs.filter((h) => clean === h || clean.startsWith(h + '/')).sort((a, b) => b.length - a.length)[0] ?? null;
  }, [clean]);
  const isActive = (href?: string) => !!href && href === activeHref;
  const activeParent = NAV.find((n) => n.children?.some((c) => c.href === activeHref)) ?? null;

  // route-derived breadcrumbs (Dashboard › Parent › Child › sub-page)
  const crumbs = useMemo(() => {
    const out: { label: string; href?: string }[] = [{ label: 'Dashboard', href: '/admin/overview' }];
    const parent = activeParent ?? NAV.find((n) => n.href === activeHref) ?? null;
    if (!parent || parent.key === 'dashboard') return out;
    const child = parent.children?.find((c) => c.href === activeHref) ?? null;
    out.push({ label: parent.label, href: parent.href ?? parent.children?.[0]?.href });
    if (child) out.push({ label: child.label, href: child.href });
    const base = child?.href ?? parent.href ?? '';
    const rest = clean.slice(base.length).replace(/^\//, '').split('/')[0];
    const friendly: Record<string, string> = { new: 'New', view: 'Details', edit: 'Edit' };
    if (rest) out.push({ label: friendly[rest] ?? rest.replace(/-/g, ' ') });
    return out;
  }, [clean, activeHref, activeParent]);

  useEffect(() => {
    if (isLogin) return;
    let alive = true;
    fetchMe().then((m) => {
      if (!alive) return;
      setMe(m);
      if (!m) router.replace('/admin/login');
      else if (clean === '/admin') router.replace('/admin/overview');
    });
    return () => { alive = false; };
  }, [isLogin, clean, router]);

  // accordion: on navigation, reset manual override + close any flyout, so the current group auto-opens
  useEffect(() => { setOpenKey(null); setFlyout(null); }, [clean]);
  const openGroup = openKey ?? activeParent?.key ?? null;

  // The login page renders itself, outside the gated shell.
  if (isLogin) return <>{children}</>;

  if (me === undefined) return <Loader full />;
  if (!me) return <Loader full label="Redirecting to sign in…" />;

  const nav = NAV
    .map((n) => ({ ...n, children: n.children?.filter((c) => !c.perm || operatorCan(me, c.perm)) }))
    .filter((n) => (!n.perm || operatorCan(me, n.perm)) && (n.href || (n.children && n.children.length)));
  const roleLabel = me.isSuperAdmin ? 'Super Admin' : (me.memberships[0]?.role ?? 'Operator');
  const initials = (me.name ?? 'U').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const signOut = () => { clearOperator(); router.replace('/admin/login'); };

  return (
    <div className={`admin-shell${collapsed ? ' collapsed' : ''}`}>
      <aside className="admin-side">
        <div className="admin-logo">
          <img src="/icon.svg" alt="" width={34} height={34} style={{ borderRadius: 9 }} />
          <span className="lg-txt">
            <span className="n">Investo<span style={{ color: 'var(--gold-600)' }}>yard</span></span>
            <span className="s">IPO Console</span>
          </span>
        </div>
        <nav className="admin-nav">
          {nav.map((n) => {
            // Leaf item — direct link.
            if (!n.children || !n.children.length) {
              return (
                <a key={n.key} href={n.href} className={`nav-link${isActive(n.href) ? ' active' : ''}`} data-label={n.label}>
                  <Icon name={n.icon} size={18} /><span className="lbl">{n.label}</span>
                </a>
              );
            }
            const groupActive = n.children.some((c) => isActive(c.href));
            // Collapsed rail — click opens a flyout submenu popover.
            if (collapsed) {
              return (
                <div key={n.key} className={`nav-fly${flyout === n.key ? ' open' : ''}`} onClick={(e) => e.stopPropagation()}>
                  <button type="button" className={`nav-link${groupActive ? ' active' : ''}`} data-label={n.label}
                    onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setFlyPos({ top: Math.max(8, Math.min(r.top, window.innerHeight - 300)), left: r.right + 10 }); setFlyout((f) => (f === n.key ? null : n.key)); }} aria-haspopup="true" aria-expanded={flyout === n.key}>
                    <Icon name={n.icon} size={18} /><span className="lbl">{n.label}</span>
                  </button>
                  {flyout === n.key && flyPos && (
                    <div className="fly-pop" style={{ position: 'fixed', top: flyPos.top, left: flyPos.left, right: 'auto', zIndex: 1000 }}>
                      <div className="fly-head"><span>{n.label}</span><button className="fly-x" onClick={() => setFlyout(null)} aria-label="Close"><Icon name="x" size={14} /></button></div>
                      {n.children.map((c) => (
                        <a key={c.href} href={c.href} className={isActive(c.href) ? 'active' : ''}>{c.label}</a>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            // Expanded — inline accordion submenu.
            const open = openGroup === n.key;
            return (
              <div key={n.key} className={`nav-group${open ? ' open' : ''}`}>
                <button type="button" className={`nav-link nav-parent${groupActive ? ' active' : ''}`} aria-expanded={open}
                  onClick={() => setOpenKey(open ? '' : n.key)}>
                  <Icon name={n.icon} size={18} /><span className="lbl">{n.label}</span>
                  <Icon name="chevron-down" size={15} style={{ marginLeft: 'auto' }} />
                </button>
                <div className="nav-sub">
                  {n.children.map((c) => (
                    <a key={c.href} href={c.href} className={isActive(c.href) ? 'active' : ''}>
                      <span className="sub-dot" />{c.label}
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="admin-body">
        <header className="admin-top">
          <button className="hamburger" onClick={toggleCollapsed} aria-label="Toggle menu"><Icon name="menu" size={19} /></button>
          <nav className="crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i} className="crumb">
                {i > 0 && <span className="sep">›</span>}
                {c.href && i < crumbs.length - 1 ? <a href={c.href}>{c.label}</a> : <span className="cur">{c.label}</span>}
              </span>
            ))}
          </nav>
          <div style={{ flex: 1 }} />
          <div className="conn-pills">
            <span className="conn"><span className="conn-dot" /> NSE <b>Connected</b></span>
            <span className="conn"><span className="conn-dot" /> BSE <b>Connected</b></span>
          </div>
          <button className="theme-toggle" aria-label="Help & docs" title="Help & docs"><Icon name="help" size={17} /></button>
          <div className="profile-menu" onClick={(e) => e.stopPropagation()}>
            <button className="theme-toggle" onClick={() => { setNotifOpen((o) => !o); setMenuOpen(false); }} aria-label="Notifications" style={{ position: 'relative' }}>
              <Icon name="bell" size={17} />{notifs.length > 0 && <span className="notif-dot" />}
            </button>
            {notifOpen && (
              <div className="notif-drop">
                <div className="nd-head"><span className="t">Notifications</span>{notifs.length > 0 && <span className="st brand">{notifs.length}</span>}</div>
                <div className="nd-list">
                  {notifs.length === 0 ? <div className="notif-empty">You’re all caught up.</div> :
                    notifs.map((a) => (
                      <div className="notif-item" key={a.id}>
                        <span className={`ni-ic ${a.tone}`}><Icon name={a.icon} size={16} /></span>
                        <div style={{ minWidth: 0 }}><div className="ni-t">{a.text}</div><div className="ni-s">{a.sub}</div></div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme" title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
          </button>
          <div className="profile-menu" onClick={(e) => e.stopPropagation()}>
            <button className="profile-btn" onClick={() => setMenuOpen((o) => !o)}>
              <div className="admin-avatar">{initials}</div>
              <div className="pm-id">
                <span className="pm-name">{me.name}</span>
                <span className="pm-role">{roleLabel}</span>
              </div>
              <Icon name="chevron-down" size={15} style={{ color: 'var(--text-faint)' }} />
            </button>
            {menuOpen && (
              <div className="profile-drop">
                <div className="pm-head">
                  <div className="admin-avatar">{initials}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="pm-name">{me.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{me.homeTenant.name}</div>
                  </div>
                </div>
                <button className="pm-item" onClick={() => { toggleTheme(); setMenuOpen(false); }}>
                  <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /> {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                <a className="pm-item" href="/"><Icon name="external" size={16} /> Back to site</a>
                <button className="pm-item danger" onClick={() => { setMenuOpen(false); setAskLogout(true); }}><Icon name="logout" size={16} /> Sign out</button>
              </div>
            )}
          </div>
        </header>
        <main className="admin-main"><OperatorContext.Provider value={me}>{children}</OperatorContext.Provider></main>
      </div>
      {askLogout && (
        <ConfirmDialog
          state={{ title: 'Sign out?', message: 'You’ll need to sign in again to access the console.', confirmLabel: 'Sign out', danger: true, onConfirm: signOut }}
          onClose={() => setAskLogout(false)}
        />
      )}
    </div>
  );
}
