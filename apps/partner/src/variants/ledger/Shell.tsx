'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { usePartner } from '@/core/tenant';

const NAV = [
  { href: '/', label: 'Register' },
  { href: '/subscription/', label: 'Subscription' },
  { href: '/allotment/', label: 'Allotment' },
  { href: '/ipos/', label: 'Archive' },
];
const isCurrent = (path: string, href: string) =>
  href === '/' ? path === '/' || (path.startsWith('/ipos/') && path !== '/ipos/') : path === href;

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() || '/';
  const p = usePartner();
  const year = new Date().getFullYear();
  return (
    <>
      <a className="sr" href="#main">Skip to content</a>
      <header className="l-mast">
        <div className="l-col l-mast-in">
          {p ? (
            <Link href="/" className="l-name" aria-label={`${p.name} — home`}>
              {p.logo ? <img className="l-name-logo" src={p.logo} alt={p.name} /> : p.name}
            </Link>
          ) : <span className="l-name"><span className="l-name-ph" aria-hidden="true" /></span>}
          <nav className="l-nav" aria-label="Primary">
            {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>{n.label}</Link>)}
          </nav>
        </div>
      </header>
      <main id="main" className="l-col">{children}</main>
      <footer className="l-foot">
        <div className="l-col">
          {/* Only what the partner has entered — never our identity. */}
          <div className="l-foot-id">
            {p ? <strong>{p.legalName || p.name}</strong> : null}
            {p && p.sebi ? <> · SEBI Reg. No. <span className="mono">{p.sebi}</span></> : null}
            {p && p.grievanceEmail ? <><br />Grievances: {p.grievanceName ? `${p.grievanceName}, ` : ''}{p.grievanceEmail}</> : null}
            {p && p.supportEmail ? <><br />Support: {p.supportEmail}{p.supportPhone ? ` · ${p.supportPhone}` : ''}</> : null}
          </div>
          <nav aria-label="Footer">
            {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
            {p && p.legalName ? <span suppressHydrationWarning>© {year} {p.legalName}</span> : null}
          </nav>
          <p className="l-foot-risk">Investments in the securities market are subject to market risks. Read all related documents carefully before investing. Figures as published by NSE and BSE; informational, not advice.</p>
        </div>
      </footer>
    </>
  );
}
