'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { initialOf, usePartner } from '@/core/tenant';

const NAV = [
  { href: '/', label: 'IPOs' },
  { href: '/subscription/', label: 'Subscription' },
  { href: '/allotment/', label: 'Allotment' },
  { href: '/ipos/', label: 'Archive' },
];
const isCurrent = (path: string, href: string) =>
  href === '/' ? path === '/' || (path.startsWith('/ipos/') && path !== '/ipos/') : path === href;

function Brand() {
  const p = usePartner();
  if (!p) return <span className="h-brand"><span className="h-brand-ph" aria-hidden="true" /></span>;
  return (
    <Link href="/" className="h-brand" aria-label={`${p.name} — home`}>
      {p.logo ? <img className="h-brand-logo" src={p.logo} alt={p.name} /> : (
        <><span className="h-mark" aria-hidden="true">{initialOf(p)}</span><span className="h-brand-name">{p.name}</span></>
      )}
    </Link>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() || '/';
  const p = usePartner();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const year = new Date().getFullYear();
  return (
    <>
      <a className="sr" href="#main">Skip to content</a>
      <header className="h-head">
        <div className="h-wrap h-head-in">
          <Brand />
          <nav className="h-nav" aria-label="Primary">
            {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>{n.label}</Link>)}
          </nav>
          <Link className="h-btn h-btn-on" href="/allotment/">Check allotment</Link>
          <button type="button" className="h-menu" aria-expanded={open} aria-controls="h-drawer" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((v) => !v)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
        <nav id="h-drawer" className="h-drawer" data-open={open} aria-label="Menu">
          {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>{n.label}</Link>)}
          <Link className="h-btn h-btn-on" href="/allotment/">Check allotment</Link>
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer className="h-foot">
        <div className="h-wrap">
          {/* The partner's own name, never ours. Empty until the host resolves. */}
          <div className="h-foot-name dsp" aria-hidden={p ? undefined : true}>{p ? p.name : ' '}</div>
          <div className="h-foot-grid">
            <div className="h-foot-id">
              {p && p.legalName ? <strong style={{ color: '#fff' }}>{p.legalName}</strong> : null}
              {p && p.sebi ? <><br />SEBI Reg. No. {p.sebi}</> : null}
              {p && p.grievanceEmail ? <><br />Grievances: {p.grievanceName ? `${p.grievanceName}, ` : ''}{p.grievanceEmail}</> : null}
              {p && p.supportEmail ? <><br />Support: {p.supportEmail}{p.supportPhone ? ` · ${p.supportPhone}` : ''}</> : null}
            </div>
            <nav aria-label="IPOs">
              <strong>IPOs</strong>
              <Link href="/">Current issues</Link><Link href="/subscription/">Live subscription</Link><Link href="/ipos/">Archive</Link>
            </nav>
            <nav aria-label="Tools">
              <strong>Tools</strong>
              <Link href="/allotment/">Allotment status</Link>
            </nav>
          </div>
          <div className="h-foot-note">
            <span>Investments in the securities market are subject to market risks. Read all related documents carefully before investing. Figures as published by NSE and BSE; informational, not advice.</span>
            {p && p.legalName ? <span suppressHydrationWarning>© {year} {p.legalName}</span> : null}
          </div>
        </div>
      </footer>
    </>
  );
}
