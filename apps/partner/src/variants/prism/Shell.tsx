'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { initialOf, usePartner } from '@/core/tenant';
import { footerLogo, footerModel, LEGAL_PAGES, RISK_TEXT } from '@/core/footer';
import { Icon } from './parts';

const NAV = [
  { href: '/', label: 'IPOs', icon: 'grid' },
  { href: '/calendar/', label: 'IPO Calendar', icon: 'calendar' },
  { href: '/subscription/', label: 'Subscription', icon: 'chart' },
  { href: '/allotment/', label: 'Allotment', icon: 'check' },
  { href: '/ipos/', label: 'Archive', icon: 'layers' },
] as const;
const isCurrent = (path: string, href: string) =>
  href === '/' ? path === '/' || (path.startsWith('/ipos/') && path !== '/ipos/') : path === href;

function Brand() {
  const p = usePartner();
  if (!p) return <span className="p-brand"><span className="p-brand-ph" aria-hidden="true" /></span>;
  const lg = footerLogo(p, 'light');
  return (
    <Link href="/" className="p-brand" aria-label={`${p.name} — home`}>
      {lg ? <img className={'p-brand-logo' + (lg.plate ? ' plate' : '')} src={lg.src} alt={p.name} /> : (
        <><span className="p-mark" aria-hidden="true">{initialOf(p)}</span><span className="p-brand-name">{p.name}<span className="p-brand-sub">IPO research &amp; allotment</span></span></>
      )}
    </Link>
  );
}

/* Search sends the reader to the archive, which filters on ?q=. It searches every IPO, not just the current page. */
function Search({ id }: { id: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const go = (e: FormEvent) => { e.preventDefault(); const s = q.trim(); router.push(s ? `/ipos/?q=${encodeURIComponent(s)}` : '/ipos/'); };
  return (
    <form className="p-search" role="search" onSubmit={go}>
      <Icon name="search" size={18} />
      <label className="sr" htmlFor={id}>Search IPOs</label>
      <input id={id} type="search" placeholder="Search IPO or company" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}

function Footer() {
  const p = usePartner();
  const year = new Date().getFullYear();
  if (!p) return <footer className="p-foot" />;
  const f = footerModel(p);
  const lg = footerLogo(p, 'light');
  return (
    <footer className="p-foot">
      <div className="p-wrap">
        <div className="p-foot-grid">
          <div className="p-foot-brand">
            {lg ? <img className={'p-foot-logo' + (lg.plate ? ' plate' : '')} src={lg.src} alt={p.name} /> : <span className="p-foot-name">{p.name}</span>}
            {/* Only what the partner has entered — never our identity. */}
            <div className="p-foot-id">
              {f.legalName ? <b>{f.legalName}</b> : null}
              {f.registration.map((r) => <div key={r.k}>{r.k} <span className="num">{r.v}</span></div>)}
              {f.address ? <div>{f.address}</div> : null}
            </div>
          </div>
          <nav className="p-foot-col" aria-label="IPOs">
            <strong>IPOs</strong>
            <Link href="/">Current IPOs</Link>
            <Link href="/calendar/">IPO calendar</Link>
            <Link href="/subscription/">Live subscription</Link>
            <Link href="/ipos/">Archive</Link>
          </nav>
          <nav className="p-foot-col" aria-label="Tools">
            <strong>Tools</strong>
            <Link href="/allotment/">Allotment status</Link>
            <strong style={{ marginTop: 10 }}>Legal</strong>
            {LEGAL_PAGES.map((l) => <Link key={l.key} href={l.href}>{l.label}</Link>)}
          </nav>
          {f.support.length || f.grievance.length ? (
            <div className="p-foot-col">
              {f.support.length ? <><strong>Support</strong>{f.support.map((s) => <a key={s.k} href={s.href}>{s.v}</a>)}</> : null}
              {f.grievance.length ? <><strong style={{ marginTop: f.support.length ? 10 : 0 }}>Grievances</strong>{f.grievance.map((g) => g.href ? <a key={g.k} href={g.href}>{g.v}</a> : <span key={g.k}>{g.v}</span>)}</> : null}
            </div>
          ) : <div />}
        </div>
        <div className="p-foot-base">
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
  const links = NAV.map((n) => (
    <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>
      <Icon name={n.icon} size={19} />{n.label}
    </Link>
  ));
  return (
    <>
      <a className="sr" href="#main">Skip to content</a>
      <header className="p-head">
        <div className="p-wrap p-head-in">
          <Brand />
          <nav className="p-nav" aria-label="Primary">{links}</nav>
          <Search id="p-q" />
          <button type="button" className="p-menu" aria-expanded={open} aria-controls="p-drawer" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((v) => !v)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
        <nav id="p-drawer" className="p-drawer" data-open={open} aria-label="Menu">{links}<Search id="p-q-m" /></nav>
      </header>
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
