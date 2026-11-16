'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { initialOf, usePartner } from '@/core/tenant';
import { footerLogo, footerModel, RISK_TEXT } from '@/core/footer';

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
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
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
      <Footer />
    </>
  );
}

/*
 * The footer: a dark band with the partner's own mark leading it — their
 * footer (light) logo when they uploaded one, else their name set large — a
 * call to the one tool every visitor may need, four columns, and the
 * disclosure. Only what the partner has entered; never our identity.
 */
function Footer() {
  const p = usePartner();
  const year = new Date().getFullYear();
  if (!p) return <footer className="h-foot" />;
  const f = footerModel(p);
  const lg = footerLogo(p, 'dark');
  return (
    <footer className="h-foot">
      <div className="h-wrap">
        <div className="h-foot-grid">
          <div className="h-foot-id">
            {lg ? <img className={'h-foot-logo' + (lg.plate ? ' plate' : '')} src={lg.src} alt={p.name} /> : <span className="h-foot-name dsp">{p.name}</span>}
            {f.legalName ? <strong>{f.legalName}</strong> : null}
            {f.registration.map((r) => <span key={r.k}>{r.k} <span className="num">{r.v}</span></span>)}
            {f.address ? <span>{f.address}</span> : null}
          </div>
          <nav aria-label="IPOs">
            <strong>IPOs</strong>
            <Link href="/">Current issues</Link><Link href="/subscription/">Live subscription</Link><Link href="/ipos/">Archive</Link>
          </nav>
          <nav aria-label="Tools">
            <strong>Tools</strong>
            <Link href="/allotment/">Allotment status</Link>
          </nav>
          {f.support.length || f.grievance.length ? (
            <nav aria-label="Contact">
              {f.support.length ? <><strong>Support</strong>{f.support.map((s) => <a key={s.k} href={s.href}>{s.v}</a>)}</> : null}
              {f.grievance.length ? <><strong style={{ marginTop: f.support.length ? 12 : 0 }}>Grievances</strong>{f.grievance.map((g) => g.href ? <a key={g.k} href={g.href}>{g.v}</a> : <span key={g.k}>{g.v}</span>)}</> : null}
            </nav>
          ) : <div />}
        </div>
        <div className="h-foot-note">
          <span>{RISK_TEXT}</span>
          <span suppressHydrationWarning>© {year} {f.owner}</span>
        </div>
      </div>
    </footer>
  );
}
