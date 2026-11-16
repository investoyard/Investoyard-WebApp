'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import * as st from '@investoyard/shared-types';
import { initialOf, usePartner } from '@/core/tenant';
import { footerLogo, footerModel, RISK_TEXT } from '@/core/footer';

const NAV = [
  { href: '/', label: 'Market' },
  { href: '/subscription/', label: 'Subscription' },
  { href: '/allotment/', label: 'Allotment' },
  { href: '/ipos/', label: 'All IPOs' },
];
const isCurrent = (path: string, href: string) =>
  href === '/' ? path === '/' || (path.startsWith('/ipos/') && path !== '/ipos/') : path === href;

/*
 * The IST clock and the bidding-window state. Rendered only after mount: a
 * time written into static HTML is wrong by the time anyone reads it, and the
 * difference would be a hydration mismatch. "Open" needs an exchange day
 * (weekends and the published NSE holidays are excluded) inside 10:00-17:00
 * IST; outside the years the holiday list covers it says "unverified" rather
 * than guess.
 */
function Session() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <div className="t-session" aria-hidden="true"><span className="t-clock">&nbsp;</span></div>;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  const day = st.istToday();
  const covered = st.holidaysCover(day);
  const exchangeDay = !st.isTradingHoliday(day);
  const open = exchangeDay && minutes >= 600 && minutes < 1020;
  /* "Bidding hours", not "bidding open": this is the exchange's window, and on
     a day with no IPO open the latter would suggest one was. */
  const label = !exchangeDay ? 'Exchange closed today' : open ? 'Bidding hours open' : minutes < 600 ? 'Bidding hours from 10:00' : 'Bidding hours closed';
  return (
    <div className="t-session">
      <span className="t-clock" aria-label="Indian Standard Time">{get('hour')}:{get('minute')}:{get('second')} IST</span>
      <span className={`t-pill${open ? ' is-open' : ''}`} title={covered ? undefined : 'Holiday calendar not published for this year; weekends only'}>
        <i aria-hidden="true" />{label}{covered ? '' : ' (unverified)'}
      </span>
    </div>
  );
}

/* The header and footer are white, so they show the partner's main logo; a light-only footer logo goes on a dark plate. */
function Brand() {
  const p = usePartner();
  if (!p) return <span className="t-brand"><span className="t-brand-ph" aria-hidden="true" /></span>;
  const lg = footerLogo(p, 'light');
  return (
    <Link href="/" className="t-brand" aria-label={`${p.name} — home`}>
      {lg ? <img className={`t-brand-logo${lg.plate ? ' plate' : ''}`} src={lg.src} alt={p.name} /> : (
        <><span className="t-mark" aria-hidden="true">{initialOf(p)}</span><span className="t-brand-name">{p.name}</span></>
      )}
    </Link>
  );
}

function Footer() {
  const p = usePartner();
  const year = new Date().getFullYear();
  if (!p) return <footer className="t-foot" />;
  const f = footerModel(p);
  const lg = footerLogo(p, 'light');
  return (
    <footer className="t-foot">
      <div className="t-wrap">
        <div className="t-foot-grid">
          <div className="t-foot-brand">
            {lg ? <img className={`t-foot-logo${lg.plate ? ' plate' : ''}`} src={lg.src} alt={p.name} /> : <span className="t-foot-name">{p.name}</span>}
            {/* Only what the partner has entered — never our identity. */}
            <div className="t-foot-id">
              {f.legalName ? <b>{f.legalName}</b> : null}
              {f.registration.map((r) => <div key={r.k}>{r.k} <span className="num">{r.v}</span></div>)}
              {f.address ? <div>{f.address}</div> : null}
            </div>
          </div>
          <nav className="t-foot-col" aria-label="Markets">
            <h3>Markets</h3>
            <Link href="/">Current IPOs</Link>
            <Link href="/subscription/">Live subscription</Link>
            <Link href="/ipos/">All IPOs</Link>
          </nav>
          <nav className="t-foot-col" aria-label="Tools">
            <h3>Tools</h3>
            <Link href="/allotment/">Allotment status</Link>
          </nav>
          {f.support.length || f.grievance.length ? (
            <div className="t-foot-col">
              {f.support.length ? <><h3>Support</h3>{f.support.map((s) => <a key={s.k} href={s.href}>{s.v}</a>)}</> : null}
              {f.grievance.length ? <><h3 style={{ marginTop: f.support.length ? 12 : 0 }}>Grievances</h3>{f.grievance.map((g) => g.href ? <a key={g.k} href={g.href}>{g.v}</a> : <span key={g.k}>{g.v}</span>)}</> : null}
            </div>
          ) : <div />}
        </div>
        <div className="t-foot-base">
          <p>{RISK_TEXT}</p>
          <p suppressHydrationWarning>© {year} {f.owner}</p>
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
      <header className="t-top">
        <div className="t-wrap t-top-in">
          <Brand />
          <nav className="t-nav" aria-label="Primary">
            {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>{n.label}</Link>)}
          </nav>
          <Session />
        </div>
        <nav className="t-mnav" aria-label="Primary (mobile)">
          {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>{n.label}</Link>)}
        </nav>
      </header>
      <main id="main" className="t-wrap">{children}</main>
      <Footer />
    </>
  );
}
