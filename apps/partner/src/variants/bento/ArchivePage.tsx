'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ArchiveRow } from '@/core/models';
import { dayMonYear } from '@/core/format';
import { Board, Hero, Icon, Logo, type IconName } from './parts';

type Sort = 'new' | 'old' | 'size' | 'subs';
const SIZES: [string, string, (n: number | null) => boolean][] = [
  ['all', 'All', () => true],
  ['s', 'Under ₹100 Cr', (n) => n != null && n < 100],
  ['m', '₹100–500 Cr', (n) => n != null && n >= 100 && n < 500],
  ['l', '₹500–1,000 Cr', (n) => n != null && n >= 500 && n < 1000],
  ['xl', '₹1,000 Cr and above', (n) => n != null && n >= 1000],
];

/* Page numbers with gaps: 1 2 3 4 5 … 58, keeping the current page and its neighbours visible. */
function pageList(p: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const set = new Set([0, pages - 1, p - 1, p, p + 1].filter((x) => x >= 0 && x < pages));
  if (p < 4) [1, 2, 3, 4].forEach((x) => set.add(x));
  if (p > pages - 5) [pages - 5, pages - 4, pages - 3, pages - 2].forEach((x) => set.add(x));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((x, i) => { if (i && x - sorted[i - 1] > 1) out.push(null); out.push(x); });
  return out;
}
const d = (iso: string) => (iso ? dayMonYear(iso) : '—');

export default function ArchivePage({ rows, heading }: { rows: ArchiveRow[]; heading?: { title: string; sub: string } }) {
  const [q, setQ] = useState('');
  const [year, setYear] = useState('all');
  const [sector, setSector] = useState('all');
  const [board, setBoard] = useState('all');
  const [size, setSize] = useState('all');
  const [sort, setSort] = useState<Sort>('new');
  const [per, setPer] = useState(25);
  const [page, setPage] = useState(0);

  /* The header search lands here with ?q=; read after mount, since a static export has no query string at build time. */
  useEffect(() => { try { const v = new URLSearchParams(window.location.search).get('q'); if (v) setQ(v); } catch { /* ignore */ } }, []);

  const years = useMemo(() => Array.from(new Set(rows.map((r) => r.year).filter(Boolean) as number[])).sort((a, b) => b - a), [rows]);
  const sectors = useMemo(() => Array.from(new Set(rows.map((r) => r.industry).filter(Boolean) as string[])).sort(), [rows]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const fit = SIZES.find((x) => x[0] === size)![2];
    const out = rows.filter((r) => (year === 'all' || String(r.year) === year) && (sector === 'all' || r.industry === sector) && (board === 'all' || r.board === board) && fit(r.sizeN) && (!s || r.name.toLowerCase().includes(s) || r.sym.toLowerCase().includes(s)));
    const by: Record<Sort, (a: ArchiveRow, b: ArchiveRow) => number> = {
      new: (a, b) => (a.open < b.open ? 1 : a.open > b.open ? -1 : 0),
      old: (a, b) => (a.open < b.open ? -1 : a.open > b.open ? 1 : 0),
      size: (a, b) => (b.sizeN ?? -1) - (a.sizeN ?? -1),
      subs: (a, b) => (b.subsN ?? -1) - (a.subsN ?? -1),
    };
    return out.sort(by[sort]);
  }, [rows, q, year, sector, board, size, sort]);
  const pages = Math.max(1, Math.ceil(list.length / per));
  const p = Math.min(page, pages - 1);
  const shown = list.slice(p * per, p * per + per);
  const reset = () => setPage(0);
  const clear = () => { setQ(''); setYear('all'); setSector('all'); setBoard('all'); setSize('all'); setSort('new'); reset(); };
  const thisYear = years[0];
  const stats: [IconName, string, string][] = [
    ['layers', list.length.toLocaleString('en-IN'), 'Total IPOs'],
    ['bank', list.filter((r) => r.board === 'Mainboard').length.toLocaleString('en-IN'), 'Mainboard'],
    ['rocket', list.filter((r) => r.board === 'SME').length.toLocaleString('en-IN'), 'SME'],
    ['calendar', list.filter((r) => r.year === thisYear).length.toLocaleString('en-IN'), thisYear ? `Opened in ${thisYear}` : 'This year'],
  ];
  const exportCsv = () => {
    const head = ['IPO', 'Symbol', 'Board', 'Sector', 'Price band', 'Issue size', 'Subscribed', 'Open date', 'Close date', 'Listing date', 'Status'];
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = list.map((r) => [r.name, r.sym, r.board, r.industry || '', r.band, r.size, r.subs || '', r.open, r.close, r.listing, r.status].map((v) => esc(String(v))).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ipo-archive.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <>
      <Hero eyebrow={heading ? 'IPOs' : 'IPO archive'} title={heading ? heading.title : 'Historical IPO Database'} sub={heading ? heading.sub : `Explore every mainboard and SME IPO${years.length ? ` since ${years[years.length - 1]}` : ''}: dates, price bands, issue sizes and final subscription in one place.`} art="exchange">
        <dl className="b-hstats">
          {stats.map(([ic, v, l]) => <div key={l}><span className="b-strip-ic"><Icon name={ic} size={22} /></span><span><dt>{l}</dt><dd className="num">{v}</dd></span></div>)}
        </dl>
      </Hero>
      <div className="b-wrap b-main">
        <section className="b-card b-arf" aria-label="Filters">
          <label className="b-qbox b-qbox-lg"><Icon name="search" size={18} /><span className="sr">Search</span><input type="search" placeholder="Search by company or symbol" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} /></label>
          <label className="b-flbl">Year<select className="b-field" value={year} onChange={(e) => { setYear(e.target.value); reset(); }}><option value="all">All years</option>{years.map((y) => <option key={y} value={String(y)}>{y}</option>)}</select></label>
          <label className="b-flbl">Sector<select className="b-field" value={sector} onChange={(e) => { setSector(e.target.value); reset(); }}><option value="all">All sectors</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="b-flbl">Board<select className="b-field" value={board} onChange={(e) => { setBoard(e.target.value); reset(); }}><option value="all">All</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option></select></label>
          <label className="b-flbl">Issue size<select className="b-field" value={size} onChange={(e) => { setSize(e.target.value); reset(); }}>{SIZES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <button type="button" className="b-link b-link-btn b-clear" onClick={clear}><Icon name="reset" size={16} />Reset</button>
        </section>

        <section className="b-card b-card-flush" aria-label="Historical IPOs">
          <div className="b-card-bar">
            <span className="b-muted num" role="status">{list.length ? <>Showing <b>{(p * per + 1).toLocaleString('en-IN')}–{Math.min(list.length, p * per + per).toLocaleString('en-IN')}</b> of <b>{list.length.toLocaleString('en-IN')}</b> IPOs</> : 'No match'}</span>
            <div className="b-filters">
              <label className="b-sortl">Sort by<select className="b-field" value={sort} onChange={(e) => { setSort(e.target.value as Sort); reset(); }}><option value="new">Open date (newest)</option><option value="old">Open date (oldest)</option><option value="size">Issue size</option><option value="subs">Subscription</option></select></label>
              <button type="button" className="b-btn b-btn-q b-btn-sm" onClick={exportCsv} disabled={!list.length}><Icon name="download" size={16} />Export</button>
            </div>
          </div>
          <div className="b-tbl-wrap">
            <table className="b-tbl b-tbl-ar">
              <thead><tr><th className="num b-c2">#</th><th>Company / IPO</th><th className="b-c1">Sector</th><th className="r b-c2">Price (₹)</th><th className="r">Size (₹ Cr)</th><th className="r">Subscribed</th><th>Opened</th><th className="b-c1">Closed</th><th>Listed</th><th className="b-c2"><span className="sr">Open</span></th></tr></thead>
              <tbody>
                {shown.length ? shown.map((r, i) => (
                  <tr key={r.sym}>
                    <td className="num b-muted b-c2">{p * per + i + 1}</td>
                    <td><Link className="b-arco" href={r.href}><Logo ipo={r} size="sm" /><b title={r.name}>{r.name}</b>{r.board === 'SME' ? <Board board="SME" /> : null}</Link></td>
                    <td className="b-muted b-sector b-c1" title={r.industry || undefined}>{r.industry || '—'}</td>
                    <td className="r num b-c2">{r.band.replace(/₹/g, '')}</td>
                    <td className="r num">{r.sizeN != null ? r.sizeN.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</td>
                    <td className="r num"><b className="b-x">{r.subs || '—'}</b></td>
                    <td className="num">{d(r.open)}</td>
                    <td className="num b-c1">{d(r.close)}</td>
                    <td className="num">{d(r.listing)}</td>
                    <td className="b-c2"><Link className="b-view" href={r.href}>View</Link></td>
                  </tr>
                )) : <tr><td colSpan={10} className="b-none">No IPO matches. Try a shorter name, or reset the filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <ul className="b-mrows">
            {!shown.length ? <li className="b-none">No IPO matches. Try a shorter name, or reset the filters.</li> : null}
            {shown.map((r) => (
              <li key={r.sym}><Link href={r.href} className="b-mrow"><span className="b-mrow-h"><Logo ipo={r} size="sm" /><span><b>{r.name}</b><small>{r.board} · {r.dates}{r.year ? ` ${r.year}` : ''}</small></span><b className="num b-x">{r.subs || r.size}</b></span></Link></li>
            ))}
          </ul>
          <div className="b-pager">
            <label className="b-sortl">Rows per page<select className="b-field" value={per} onChange={(e) => { setPer(Number(e.target.value)); reset(); }}>{[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            {pages > 1 ? (
              <nav className="b-pages" aria-label="Pages">
                <button type="button" onClick={() => setPage(p - 1)} disabled={p === 0} aria-label="Previous page">‹</button>
                {pageList(p, pages).map((x, i) => x == null ? <span key={`g${i}`} className="b-gap">…</span> : <button key={x} type="button" aria-current={x === p ? 'page' : undefined} onClick={() => setPage(x)}>{x + 1}</button>)}
                <button type="button" onClick={() => setPage(p + 1)} disabled={p >= pages - 1} aria-label="Next page">›</button>
              </nav>
            ) : null}
          </div>
        </section>
        <p className="b-fine">Subscription is the final overall figure where the exchanges published one. Listing-day prices are not shown because they are not recorded for most issues.</p>
      </div>
    </>
  );
}
