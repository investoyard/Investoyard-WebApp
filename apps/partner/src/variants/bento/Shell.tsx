'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { initialOf, usePartner } from '@/core/tenant';
import { footerLogo, footerModel, LEGAL_PAGES, RISK_TEXT } from '@/core/footer';
import { Icon, type IconName } from './parts';

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'IPOs', icon: 'home' },
  { href: '/subscription/', label: 'Subscription', icon: 'chart' },
  { href: '/calendar/', label: 'Calendar', icon: 'calendar' },
  { href: '/allotment/', label: 'Allotment', icon: 'check' },
  { href: '/ipos/', label: 'Archive', icon: 'layers' },
];
const isCurrent = (path: string, href: string) =>
  href === '/' ? path === '/' || (path.startsWith('/ipos/') && path !== '/ipos/') : path === href;

function Brand() {
  const p = usePartner();
  if (!p) return <span className="b-brand"><span className="b-brand-ph" aria-hidden="true" /></span>;
  const lg = footerLogo(p, 'light');
  return (
    <Link href="/" className="b-brand" aria-label={`${p.name} — home`}>
      {lg ? <img className={'b-brand-logo' + (lg.plate ? ' plate' : '')} src={lg.src} alt={p.name} /> : (
        <>
          <span className="b-mark" aria-hidden="true">{initialOf(p)}</span>
          <span className="b-brand-t"><b>{p.name}</b><small>IPO research &amp; insights</small></span>
        </>
      )}
    </Link>
  );
}

/* Search sends the reader to the archive, which filters on ?q= across every IPO. */
function Search() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const go = (e: FormEvent) => { e.preventDefault(); const s = q.trim(); router.push(s ? `/ipos/?q=${encodeURIComponent(s)}` : '/ipos/'); };
  return (
    <form className="b-search" role="search" onSubmit={go}>
      <Icon name="search" size={17} />
      <label className="sr" htmlFor="b-q">Search IPOs</label>
      <input id="b-q" type="search" placeholder="Search IPO, company or sector" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
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
      <div className="b-wrap">
        <div className="b-foot-grid">
          <div className="b-foot-id">
            {lg ? <img className={'b-foot-logo' + (lg.plate ? ' plate' : '')} src={lg.src} alt={p.name} /> : <span className="b-foot-name">{p.name}</span>}
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
          </nav>
          <nav aria-label="Tools">
            <strong>Tools</strong>
            <Link href="/allotment/">Allotment status</Link>
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
        <div className="b-foot-note">
          <span>{RISK_TEXT}</span>
          <span suppressHydrationWarning>© {year} {f.owner}</span>
        </div>
      </div>
    </footer>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() || '/';
  return (
    <>
      <a className="sr" href="#main">Skip to content</a>
      <header className="b-head">
        <div className="b-wrap b-head-in">
          <Brand />
          <nav className="b-nav" aria-label="Primary">
            {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>{n.href === '/' ? <Icon name="home" size={17} /> : null}{n.label}</Link>)}
          </nav>
          <Search />
          <Link href="/ipos/" className="b-qlink" aria-label="Search IPOs"><Icon name="search" size={20} /></Link>
        </div>
      </header>
      <main id="main">{children}</main>
      <Footer />
      {/* On a phone the primary navigation is a bottom tab bar, the way an app does it. */}
      <nav className="b-tabbar" aria-label="Primary">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>
            <Icon name={n.icon} size={21} />
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
