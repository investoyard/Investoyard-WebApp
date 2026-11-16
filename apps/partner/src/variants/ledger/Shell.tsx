'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { initialOf, usePartner } from '@/core/tenant';
import { footerLogo, footerModel, RISK_TEXT } from '@/core/footer';
import { NavIcon } from './parts';

const NAV = [
  { href: '/', label: 'IPO calendar', icon: 'home' },
  { href: '/subscription/', label: 'Subscription', icon: 'subs' },
  { href: '/allotment/', label: 'Allotment', icon: 'allot' },
  { href: '/ipos/', label: 'Archive', icon: 'archive' },
] as const;
const isCurrent = (path: string, href: string) =>
  href === '/' ? path === '/' || (path.startsWith('/ipos/') && path !== '/ipos/') : path === href;

/* The rail is white, so it shows the partner's main logo; their footer (light) logo goes on a dark plate. */
function Brand() {
  const p = usePartner();
  if (!p) return <span className="l-brand"><span className="l-brand-ph" aria-hidden="true" /></span>;
  const lg = footerLogo(p, 'light');
  return (
    <Link href="/" className="l-brand" aria-label={`${p.name} — home`}>
      {lg ? <img className={`l-brand-logo${lg.plate ? ' plate' : ''}`} src={lg.src} alt={p.name} /> : (
        <><span className="l-mark" aria-hidden="true">{initialOf(p)}</span><span className="l-brand-name">{p.name}</span></>
      )}
    </Link>
  );
}

function Footer() {
  const p = usePartner();
  const year = new Date().getFullYear();
  if (!p) return <footer className="l-foot" />;
  const f = footerModel(p);
  const lg = footerLogo(p, 'light');
  return (
    <footer className="l-foot">
      <div className="l-in">
        <div className="l-foot-grid">
          <div className="l-foot-brand">
            {lg ? <img className={`l-foot-logo${lg.plate ? ' plate' : ''}`} src={lg.src} alt={p.name} /> : <span className="l-foot-name">{p.name}</span>}
            {/* Only what the partner has entered — never our identity. */}
            <div className="l-foot-id">
              {f.legalName ? <b>{f.legalName}</b> : null}
              {f.registration.map((r) => <div key={r.k}>{r.k} <span className="num">{r.v}</span></div>)}
              {f.address ? <div>{f.address}</div> : null}
            </div>
          </div>
          <nav className="l-foot-col" aria-label="IPOs">
            <h3>IPOs</h3>
            <Link href="/">IPO calendar</Link>
            <Link href="/subscription/">Live subscription</Link>
            <Link href="/ipos/">Archive</Link>
          </nav>
          <nav className="l-foot-col" aria-label="Tools">
            <h3>Tools</h3>
            <Link href="/allotment/">Allotment status</Link>
          </nav>
          {f.support.length || f.grievance.length ? (
            <div className="l-foot-col">
              {f.support.length ? <><h3>Support</h3>{f.support.map((s) => <a key={s.k} href={s.href}>{s.v}</a>)}</> : null}
              {f.grievance.length ? <><h3 style={{ marginTop: f.support.length ? 12 : 0 }}>Grievances</h3>{f.grievance.map((g) => g.href ? <a key={g.k} href={g.href}>{g.v}</a> : <span key={g.k}>{g.v}</span>)}</> : null}
            </div>
          ) : <div />}
        </div>
        <div className="l-foot-base">
          <p>{RISK_TEXT}</p>
          <p suppressHydrationWarning>© {year} {f.owner}</p>
        </div>
      </div>
    </footer>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() || '/';
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const nav = (cls: string) => NAV.map((n) => (
    <Link key={n.href} href={n.href} className={cls} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>
      <NavIcon name={n.icon} />{n.label}
    </Link>
  ));
  return (
    <>
      <a className="sr" href="#main">Skip to content</a>
      <div className="l-shell">
        <aside className="l-rail" aria-label="Site">
          <Brand />
          <p className="l-rail-sub">IPO research and allotment</p>
          <nav className="l-nav" aria-label="Primary">{nav('')}</nav>
          <div className="l-rail-card">
            <strong>Applied for an IPO?</strong>
            <p>See whether you were allotted, once the registrar publishes.</p>
            <Link className="l-btn" href="/allotment/">Check allotment</Link>
          </div>
        </aside>
        <div className="l-main">
          <header className="l-mtop">
            <div className="l-mtop-in">
              <Brand />
              <button type="button" className="l-menu" aria-expanded={open} aria-controls="l-drawer" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((v) => !v)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
                </svg>
              </button>
            </div>
            <nav id="l-drawer" className="l-drawer" data-open={open} aria-label="Menu">{nav('')}</nav>
          </header>
          <main id="main" className="l-in">{children}</main>
          <Footer />
        </div>
      </div>
    </>
  );
}
