'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { initialOf, usePartner } from '@/core/tenant';
import { footerLogo, footerModel, RISK_TEXT } from '@/core/footer';

const isCurrent = (path: string, href: string) =>
  href === '/' ? path === '/' || (path.startsWith('/ipos/') && path !== '/ipos/') : path === href;

const ICON: Record<string, ReactNode> = {
  '/': <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" />,
  '/subscription/': <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
  '/allotment/': <><path d="M9 11l3 3 7-7" /><path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11" /></>,
  '/ipos/': <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
};

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/subscription/', label: 'Subscription' },
  { href: '/allotment/', label: 'Allotment' },
  { href: '/ipos/', label: 'All IPOs' },
];

function Brand() {
  const p = usePartner();
  if (!p) return <span className="b-brand"><span className="b-brand-ph" aria-hidden="true" /></span>;
  const lg = footerLogo(p, 'light');
  return (
    <Link href="/" className="b-brand" aria-label={`${p.name} — home`}>
      {lg ? <img className={`b-brand-logo${lg.plate ? ' plate' : ''}`} src={lg.src} alt={p.name} /> : (
        <>
          <span className="b-mark disp" aria-hidden="true">{initialOf(p)}</span>
          <span className="b-brand-name disp">{p.name}</span>
        </>
      )}
    </Link>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() || '/';
  return (
    <>
      <header className="b-head">
        <div className="b-wrap b-head-in">
          <Brand />
          <nav className="b-nav" aria-label="Primary">
            {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>{n.label}</Link>)}
          </nav>
          <div className="b-head-r"><Link href="/allotment/" className="b-btn b-btn-p">Check allotment</Link></div>
        </div>
      </header>
      <main className="b-wrap">{children}</main>
      <Footer />
      {/* On a phone the primary navigation is a bottom tab bar, the way an app does it. */}
      <nav className="b-tabbar" aria-label="Primary">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[n.href]}</svg>
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

function Footer() {
  const p = usePartner();
  const year = new Date().getFullYear();
  if (!p) return <footer className="b-foot" />;
  const f = footerModel(p);
  const lg = footerLogo(p, 'light');
  return (
    <footer className="b-foot">
      <div className="b-foot-wrap">
        <div className="b-foot-grid">
          <div className="b-foot-brand">
            {lg ? <img className={`b-foot-logo${lg.plate ? ' plate' : ''}`} src={lg.src} alt={p.name} /> : <span className="b-foot-name">{p.name}</span>}
            {/* Only what the partner has entered — never our identity, never a guess. */}
            <div className="b-foot-id">
              {f.legalName ? <b>{f.legalName}</b> : null}
              {f.registration.map((r) => <div key={r.k}>{r.k} <span className="num">{r.v}</span></div>)}
              {f.address ? <div>{f.address}</div> : null}
            </div>
          </div>
          <nav className="b-foot-col" aria-label="IPOs">
            <strong>IPOs</strong>
            <Link href="/">Open and upcoming</Link>
            <Link href="/subscription/">Live subscription</Link>
            <Link href="/ipos/">All IPOs</Link>
          </nav>
          <nav className="b-foot-col" aria-label="Tools">
            <strong>Tools</strong>
            <Link href="/allotment/">Allotment status</Link>
          </nav>
          {f.support.length || f.grievance.length ? (
            <div className="b-foot-col">
              {f.support.length ? <><strong>Support</strong>{f.support.map((s) => <a key={s.k} href={s.href}>{s.v}</a>)}</> : null}
              {f.grievance.length ? <><strong style={{ marginTop: f.support.length ? 10 : 0 }}>Grievances</strong>{f.grievance.map((g) => g.href ? <a key={g.k} href={g.href}>{g.v}</a> : <span key={g.k}>{g.v}</span>)}</> : null}
            </div>
          ) : <div />}
        </div>
        <div className="b-foot-base">
          <span>{RISK_TEXT}</span>
          <span suppressHydrationWarning>© {year} {f.owner}</span>
        </div>
      </div>
    </footer>
  );
}
