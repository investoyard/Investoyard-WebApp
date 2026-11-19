'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { initialOf, usePartner } from '@/core/tenant';
import { footerLogo, footerModel, HELP_LINKS, LEGAL_PAGES, moreIpoLinks, RISK_TEXT } from '@/core/footer';
import { Icon } from './parts';

const NAV = [
  { href: '/', label: 'IPOs' },
  { href: '/subscription/', label: 'Subscription' },
  { href: '/calendar/', label: 'Calendar' },
  { href: '/allotment/', label: 'Allotment' },
  { href: '/ipos/', label: 'Archive' },
];
const isCurrent = (path: string, href: string) =>
  href === '/' ? path === '/' || (path.startsWith('/ipos/') && path !== '/ipos/') : path === href;

/* The header is white, so it shows the partner's main logo; a light-only logo goes on a dark plate. */
function Brand() {
  const p = usePartner();
  if (!p) return <span className="h-brand"><span className="h-brand-ph" aria-hidden="true" /></span>;
  const lg = footerLogo(p, 'light');
  return (
    <Link href="/" className="h-brand" aria-label={`${p.name} — home`}>
      {lg ? <img className={'h-brand-logo' + (lg.plate ? ' plate' : '')} src={lg.src} alt={p.name} /> : (
        <>
          <span className="h-mark" aria-hidden="true">{initialOf(p)}</span>
          <span className="h-brand-t"><b>{p.name}</b><small>IPO research &amp; insights</small></span>
        </>
      )}
    </Link>
  );
}

/* Search sends the reader to the archive, which filters on ?q= across every IPO. */
function Search({ id }: { id: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const go = (e: FormEvent) => { e.preventDefault(); const s = q.trim(); router.push(s ? `/ipos/?q=${encodeURIComponent(s)}` : '/ipos/'); };
  return (
    <form className="h-search" role="search" onSubmit={go}>
      <label className="sr" htmlFor={id}>Search IPOs</label>
      <input id={id} type="search" placeholder="Search IPOs or companies" value={q} onChange={(e) => setQ(e.target.value)} />
      <button type="submit" aria-label="Search"><Icon name="search" size={17} /></button>
    </form>
  );
}

function Footer() {
  const p = usePartner();
  const year = new Date().getFullYear();
  if (!p) return <footer className="h-foot" />;
  const f = footerModel(p);
  const lg = footerLogo(p, 'light');
  return (
    <footer className="h-foot">
      <div className="h-wrap">
        <div className="h-foot-grid">
          <div className="h-foot-id">
            {lg ? <img className={'h-foot-logo' + (lg.plate ? ' plate' : '')} src={lg.src} alt={p.name} /> : <span className="h-foot-name">{p.name}</span>}
            {/* Only what the partner has entered — never our identity. */}
            {f.legalName ? <strong>{f.legalName}</strong> : null}
            {f.registration.map((r) => <span key={r.k}>{r.k} <span className="num">{r.v}</span></span>)}
            {f.address ? <span>{f.address}</span> : null}
          </div>
          <nav aria-label="IPOs">
            <strong>IPOs</strong>
            <Link href="/">Current IPOs</Link>
            <Link href="/subscription/">Live subscription</Link>
            <Link href="/calendar/">IPO calendar</Link>
            <Link href="/ipos/">Archive</Link>
            {moreIpoLinks(p).map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
          </nav>
          <nav aria-label="Tools">
            <strong>Tools</strong>
            <Link href="/allotment/">Allotment status</Link>
            {HELP_LINKS.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
            <strong style={{ marginTop: 10 }}>Legal</strong>
            {LEGAL_PAGES.map((l) => <Link key={l.key} href={l.href}>{l.label}</Link>)}
          </nav>
          {f.support.length || f.grievance.length ? (
            <nav aria-label="Contact">
              {f.support.length ? <><strong>Support</strong>{f.support.map((s) => <a key={s.k} href={s.href}>{s.v}</a>)}</> : null}
              {f.grievance.length ? <><strong style={{ marginTop: f.support.length ? 10 : 0 }}>Grievances</strong>{f.grievance.map((g) => g.href ? <a key={g.k} href={g.href}>{g.v}</a> : <span key={g.k}>{g.v}</span>)}</> : null}
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

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() || '/';
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const links = NAV.map((n) => <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>{n.label}</Link>);
  return (
    <>
      <a className="sr" href="#main">Skip to content</a>
      <header className="h-head">
        <div className="h-wrap h-head-in">
          <Brand />
          <nav className="h-nav" aria-label="Primary">{links}</nav>
          <Search id="h-q" />
          <button type="button" className="h-menu" aria-expanded={open} aria-controls="h-drawer" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((v) => !v)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
        <nav id="h-drawer" className="h-drawer" data-open={open} aria-label="Menu">{links}<Search id="h-q-m" /></nav>
      </header>
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
