'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { initialOf, usePartner } from '@/core/tenant';

const NAV = [
  { href: '/', label: 'IPOs' },
  { href: '/subscription/', label: 'Subscription' },
  { href: '/allotment/', label: 'Allotment' },
  { href: '/ipos/', label: 'All IPOs' },
];

const isCurrent = (path: string, href: string) => (href === '/' ? path === '/' || path.startsWith('/ipos/') && path !== '/ipos/' : path === href);

function Brand() {
  const p = usePartner();
  if (!p) return <span className="s-brand"><span className="s-brand-ph" aria-hidden="true" /></span>;
  return (
    <Link href="/" className="s-brand" aria-label={`${p.name} — IPOs`}>
      {p.logo ? (
        <img className="s-brand-logo" src={p.logo} alt={p.name} />
      ) : (
        <>
          <span className="s-mark" aria-hidden="true">{initialOf(p)}</span>
          <span className="s-brand-name">{p.name}</span>
        </>
      )}
    </Link>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() || '/';
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <header className="s-head">
        <div className="s-wrap s-head-in">
          <Brand />
          <nav className="s-nav" aria-label="Primary">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>{n.label}</Link>
            ))}
          </nav>
          <Link href="/allotment/" className="s-btn s-btn-p s-head-cta">Check allotment</Link>
          <button type="button" className="s-menu-btn" aria-expanded={open} aria-controls="s-drawer" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
        <div id="s-drawer" className="s-drawer" data-open={open}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>{n.label}</Link>
          ))}
          <Link href="/allotment/" className="s-btn s-btn-p">Check allotment</Link>
        </div>
      </header>
      <main>{children}</main>
      <Footer />
    </>
  );
}

function Footer() {
  const p = usePartner();
  const year = new Date().getFullYear();
  return (
    <footer className="s-foot">
      <div className="s-foot-in">
        <div className="s-foot-grid">
          <div>
            {p ? (
              <div className="s-brand">
                <span className="s-mark" aria-hidden="true">{initialOf(p)}</span>
                <span className="s-brand-name">{p.name}</span>
              </div>
            ) : <span className="s-brand-ph" aria-hidden="true" />}
            {/* Only what the partner has entered. Never our identity, never a guess. */}
            {p && (p.legalName || p.sebi || p.address || p.grievanceEmail || p.supportEmail) ? (
              <p className="s-foot-id">
                {p.legalName ? <>{p.legalName}<br /></> : null}
                {p.sebi ? <>SEBI Reg. No. {p.sebi}<br /></> : null}
                {p.address ? <>{p.address}<br /></> : null}
                {p.supportEmail ? <>Support: {p.supportEmail}{p.supportPhone ? ` · ${p.supportPhone}` : ''}<br /></> : null}
                {p.grievanceEmail ? <>Grievances: {p.grievanceName ? `${p.grievanceName}, ` : ''}{p.grievanceEmail}</> : null}
              </p>
            ) : null}
          </div>
          <nav aria-label="IPOs">
            <strong>IPOs</strong>
            <Link href="/">Open and upcoming</Link>
            <Link href="/ipos/">All IPOs</Link>
          </nav>
          <nav aria-label="Tools">
            <strong>Tools</strong>
            <Link href="/subscription/">Subscription</Link>
            <Link href="/allotment/">Allotment</Link>
          </nav>
        </div>
        <div className="s-foot-b">
          <span style={{ maxWidth: 760 }}>Investments in the securities market are subject to market risks. Read all the related documents carefully before investing. Figures are as published by NSE and BSE; this site informs and does not advise.</span>
          {p && p.legalName ? <span className="num" suppressHydrationWarning>© {year} {p.legalName}</span> : null}
        </div>
      </div>
    </footer>
  );
}
