'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { initialOf, usePartner } from '@/core/tenant';
import { footerLogo, footerModel, RISK_TEXT } from '@/core/footer';

const NAV = [
  { href: '/', label: 'IPOs' },
  { href: '/subscription/', label: 'Subscription' },
  { href: '/calendar/', label: 'Calendar' },
  { href: '/allotment/', label: 'Allotment' },
  { href: '/ipos/', label: 'All IPOs' },
];

const isCurrent = (path: string, href: string) => (href === '/' ? path === '/' || path.startsWith('/ipos/') && path !== '/ipos/' : path === href);

function Brand() {
  const p = usePartner();
  if (!p) return <span className="s-brand"><span className="s-brand-ph" aria-hidden="true" /></span>;
  const lg = footerLogo(p, 'light');
  return (
    <Link href="/" className="s-brand" aria-label={`${p.name} — IPOs`}>
      {lg ? (
        <img className={`s-brand-logo${lg.plate ? ' plate' : ''}`} src={lg.src} alt={p.name} />
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
  if (!p) return <footer className="s-foot" />;
  const f = footerModel(p);
  const lg = footerLogo(p, 'light');
  return (
    <footer className="s-foot">
      <div className="s-foot-wrap">
        <div className="s-foot-grid">
          <div className="s-foot-brand">
            {lg ? <img className={`s-foot-logo${lg.plate ? ' plate' : ''}`} src={lg.src} alt={p.name} /> : <span className="s-foot-name">{p.name}</span>}
            {/* Only what the partner has entered — never our identity, never a guess. */}
            <div className="s-foot-id">
              {f.legalName ? <b>{f.legalName}</b> : null}
              {f.registration.map((r) => <div key={r.k}>{r.k} <span className="num">{r.v}</span></div>)}
              {f.address ? <div>{f.address}</div> : null}
            </div>
          </div>
          <nav className="s-foot-col" aria-label="IPOs">
            <strong>IPOs</strong>
            <Link href="/">Open and upcoming</Link>
            <Link href="/subscription/">Live subscription</Link>
            <Link href="/calendar/">IPO calendar</Link>
            <Link href="/ipos/">All IPOs</Link>
          </nav>
          <nav className="s-foot-col" aria-label="Tools">
            <strong>Tools</strong>
            <Link href="/allotment/">Allotment status</Link>
          </nav>
          {f.support.length || f.grievance.length ? (
            <div className="s-foot-col">
              {f.support.length ? <><strong>Support</strong>{f.support.map((s) => <a key={s.k} href={s.href}>{s.v}</a>)}</> : null}
              {f.grievance.length ? <><strong style={{ marginTop: f.support.length ? 10 : 0 }}>Grievances</strong>{f.grievance.map((g) => g.href ? <a key={g.k} href={g.href}>{g.v}</a> : <span key={g.k}>{g.v}</span>)}</> : null}
            </div>
          ) : <div />}
        </div>
        <div className="s-foot-base">
          <span>{RISK_TEXT}</span>
          <span suppressHydrationWarning>© {year} {f.owner}</span>
        </div>
      </div>
    </footer>
  );
}
