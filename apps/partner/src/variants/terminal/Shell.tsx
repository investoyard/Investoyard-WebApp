'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import * as st from '@investoyard/shared-types';
import { initialOf, usePartner } from '@/core/tenant';

const NAV = [
  { href: '/', label: 'Blotter' },
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
  if (!now) return <div className="t-session" aria-hidden="true"><span className="t-clock mono">&nbsp;</span></div>;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
  const hh = Number(get('hour'));
  const mm = Number(get('minute'));
  const day = st.istToday();
  const covered = st.holidaysCover(day);
  const exchangeDay = !st.isTradingHoliday(day);
  const minutes = hh * 60 + mm;
  const open = exchangeDay && minutes >= 600 && minutes < 1020;
  /* "Bidding hours", not "bidding open": this is the exchange's window, and on
     a day with no IPO open the latter would suggest one was. */
  const label = !exchangeDay ? 'Exchange closed today' : open ? 'Bidding hours open' : minutes < 600 ? 'Bidding hours from 10:00' : 'Bidding hours closed';
  return (
    <div className="t-session">
      <span className="t-clock mono" aria-label="Indian Standard Time">{get('hour')}:{get('minute')}:{get('second')} IST</span>
      <span className={`t-pill${open ? ' is-open' : ''}`} title={covered ? undefined : 'Holiday calendar not published for this year; weekends only'}>
        <i aria-hidden="true" />{label}{covered ? '' : ' (unverified)'}
      </span>
    </div>
  );
}

function Brand() {
  const p = usePartner();
  if (!p) return <span className="t-brand"><span className="t-brand-ph" aria-hidden="true" /></span>;
  return (
    <Link href="/" className="t-brand" aria-label={`${p.name} — IPO blotter`}>
      {p.logo ? <img className="t-brand-logo" src={p.logo} alt={p.name} /> : (
        <><span className="t-mark" aria-hidden="true">{initialOf(p)}</span><span className="t-brand-name">{p.name}</span></>
      )}
    </Link>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() || '/';
  const p = usePartner();
  const year = new Date().getFullYear();
  return (
    <>
      <header className="t-top">
        <div className="t-wrap t-top-in">
          <Brand />
          <nav className="t-nav" aria-label="Primary">
            {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>{n.label}</Link>)}
          </nav>
          <Session />
        </div>
      </header>
      <main className="t-wrap">{children}</main>
      <footer className="t-foot">
        <div className="t-foot-in">
          <div className="t-foot-id">
            {p ? <b>{p.legalName || p.name}</b> : null}
            {/* Only what the partner has entered — never our identity. */}
            {p && p.sebi ? <> · SEBI Reg. No. {p.sebi}</> : null}
            {p && p.grievanceEmail ? <><br />Grievances: {p.grievanceName ? `${p.grievanceName}, ` : ''}{p.grievanceEmail}</> : null}
            {p && p.supportEmail ? <><br />Support: {p.supportEmail}{p.supportPhone ? ` · ${p.supportPhone}` : ''}</> : null}
            <br />Investments in the securities market are subject to market risks. Read all related documents carefully before investing. Figures as published by NSE and BSE; informational, not advice.
          </div>
          <nav aria-label="Footer">
            <Link href="/">Blotter</Link><Link href="/subscription/">Subscription</Link><Link href="/allotment/">Allotment</Link><Link href="/ipos/">All IPOs</Link>
            {p && p.legalName ? <span suppressHydrationWarning>© {year} {p.legalName}</span> : null}
          </nav>
        </div>
      </footer>
    </>
  );
}
