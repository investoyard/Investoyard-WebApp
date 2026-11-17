'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ArchiveRow } from '@/core/models';
import { Board, Hero, Icon, Logo, Status, type IconName } from './parts';

type Sort = 'new' | 'old' | 'size' | 'subs';
const SIZES: [string, string, (n: number | null) => boolean][] = [
  ['all', 'All sizes', () => true],
  ['s', 'Under ₹100 Cr', (n) => n != null && n < 100],
  ['m', '₹100–500 Cr', (n) => n != null && n >= 100 && n < 500],
  ['l', '₹500–1,000 Cr', (n) => n != null && n >= 500 && n < 1000],
  ['xl', '₹1,000 Cr and above', (n) => n != null && n >= 1000],
];

/* Page numbers with gaps: 1 2 3 4 5 … 20, keeping the current page and its neighbours visible. */
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

export default function ArchivePage({ rows }: { rows: ArchiveRow[] }) {
  const [q, setQ] = useState('');
  const [year, setYear] = useState('all');
  const [sector, setSector] = useState('all');
  const [size, setSize] = useState('all');
  const [board, setBoard] = useState('all');
  const [sort, setSort] = useState<Sort>('new');
  const [per, setPer] = useState(25);
  const [page, setPage] = useState(0);

  /* The header search lands here with ?q=. Read after mount: a static export has no query string at build time. */
  useEffect(() => {
    try { const v = new URLSearchParams(window.location.search).get('q'); if (v) setQ(v); } catch { /* ignore */ }
  }, []);

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
  }, [rows, q, year, sector, size, board, sort]);

  const pages = Math.max(1, Math.ceil(list.length / per));
  const p = Math.min(page, pages - 1);
  const shown = list.slice(p * per, p * per + per);
  const reset = () => setPage(0);
  const clear = () => { setQ(''); setYear('all'); setSector('all'); setSize('all'); setBoard('all'); setSort('new'); reset(); };
  const thisYear = years[0];
  const stats: [IconName, string, string][] = [
    ['layers', list.length.toLocaleString('en-IN'), 'Total IPOs'],
    ['building', list.filter((r) => r.board === 'Mainboard').length.toLocaleString('en-IN'), 'Mainboard'],
    ['rocket', list.filter((r) => r.board === 'SME').length.toLocaleString('en-IN'), 'SME'],
    ['calendar', list.filter((r) => r.year === thisYear).length.toLocaleString('en-IN'), thisYear ? `Opened in ${thisYear}` : 'This year'],
  ];

  const exportCsv = () => {
    const head = ['IPO', 'Symbol', 'Board', 'Issue dates', 'Price band', 'Issue size', 'Subscribed', 'Sector', 'Status'];
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = list.map((r) => [r.name, r.sym, r.board, r.dates, r.band, r.size, r.subs || '', r.industry || '', r.status].map((v) => esc(String(v))).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ipo-archive.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <>
      <Hero eyebrow="IPO research" title="IPO archive" sub={`Every mainboard and SME IPO${years.length ? ` since ${years[years.length - 1]}` : ''}: dates, price bands, issue sizes and final subscription in one place.`} art="exchange" />
      <div className="h-wrap h-main">
        <section className="h-card h-arfilters" aria-label="Filters">
          <label className="h-qbox h-qbox-lg"><Icon name="search" size={18} /><span className="sr">Search</span><input type="search" placeholder="Search IPO or company" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} /></label>
          <label className="h-lbl">Year<select className="h-field" value={year} onChange={(e) => { setYear(e.target.value); reset(); }}><option value="all">All years</option>{years.map((y) => <option key={y} value={String(y)}>{y}</option>)}</select></label>
          <label className="h-lbl">Sector<select className="h-field" value={sector} onChange={(e) => { setSector(e.target.value); reset(); }}><option value="all">All sectors</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="h-lbl">Issue size<select className="h-field" value={size} onChange={(e) => { setSize(e.target.value); reset(); }}>{SIZES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="h-lbl">Board<select className="h-field" value={board} onChange={(e) => { setBoard(e.target.value); reset(); }}><option value="all">All</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option></select></label>
          <label className="h-lbl">Sort by<select className="h-field" value={sort} onChange={(e) => { setSort(e.target.value as Sort); reset(); }}><option value="new">Newest first</option><option value="old">Oldest first</option><option value="size">Issue size</option><option value="subs">Subscription</option></select></label>
          <button type="button" className="h-btn h-btn-q" onClick={clear}><Icon name="reset" size={16} />Reset</button>
        </section>

        <dl className="h-stats h-stats-ar">
          {stats.map(([ic, n, l]) => <div key={l}><Icon name={ic} size={24} stroke={1.6} /><span><dt>{l}</dt><dd className="num">{n}</dd></span></div>)}
        </dl>

        <section className="h-card h-card-flush" aria-labelledby="hi-h">
          <div className="h-card-bar">
            <h2 id="hi-h" className="h-h2">Historical IPOs</h2>
            <div className="h-filters">
              <span className="h-muted num" role="status">{list.length ? `Showing ${(p * per + 1).toLocaleString('en-IN')}–${Math.min(list.length, p * per + per).toLocaleString('en-IN')} of ${list.length.toLocaleString('en-IN')} IPOs` : 'No match'}</span>
              <button type="button" className="h-btn h-btn-q h-btn-sm" onClick={exportCsv} disabled={!list.length}><Icon name="download" size={16} />Export</button>
            </div>
          </div>
          <div className="h-tbl-wrap">
            <table className="h-tbl h-tbl-ar">
              <thead><tr><th className="num">#</th><th>IPO / company</th><th>Issue dates</th><th className="r">Price band</th><th className="r">Issue size</th><th className="r">Subscribed</th><th>Sector</th><th>Status</th><th><span className="sr">Open</span></th></tr></thead>
              <tbody>
                {shown.length ? shown.map((r, i) => (
                  <tr key={r.sym}>
                    <td className="num h-muted">{p * per + i + 1}</td>
                    <td><Link className="h-co" href={r.href}><Logo ipo={r} size="sm" /><span><b>{r.name}</b><small><Board board={r.board} /></small></span></Link></td>
                    <td className="num">{r.dates}{r.year ? <span className="h-muted"> {r.year}</span> : null}</td>
                    <td className="r num">{r.band}</td>
                    <td className="r num">{r.size}</td>
                    <td className="r num"><b>{r.subs || '—'}</b></td>
                    <td className="h-muted">{r.industry || '—'}</td>
                    <td><Status tone={r.tone}>{r.status}</Status></td>
                    <td><Link className="h-view" href={r.href}>View <Icon name="arrow" size={13} stroke={2} /></Link></td>
                  </tr>
                )) : <tr><td colSpan={9} className="h-tbl-none">No IPO matches. Try a shorter name, or reset the filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <ul className="h-mrows">
            {shown.map((r) => (
              <li key={r.sym}>
                <Link href={r.href} className="h-mrow">
                  <span className="h-mrow-h"><Logo ipo={r} size="sm" /><span><b>{r.name}</b><small>{r.board} · {r.dates}{r.year ? ` ${r.year}` : ''}</small></span><b className="num">{r.subs || r.size}</b></span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="h-pager h-pager-in">
            <label className="h-sel h-sel-plain">Rows per page <select value={per} onChange={(e) => { setPer(Number(e.target.value)); reset(); }}>{[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            {pages > 1 ? (
              <nav className="h-pages" aria-label="Pages">
                <button type="button" onClick={() => setPage(p - 1)} disabled={p === 0} aria-label="Previous page">‹</button>
                {pageList(p, pages).map((x, i) => x == null ? <span key={`g${i}`} className="h-gap">…</span> : <button key={x} type="button" aria-current={x === p ? 'page' : undefined} onClick={() => setPage(x)}>{x + 1}</button>)}
                <button type="button" onClick={() => setPage(p + 1)} disabled={p >= pages - 1} aria-label="Next page">›</button>
              </nav>
            ) : null}
          </div>
        </section>
        <p className="h-fine">Subscription is the final overall figure where the exchanges published one. Listing-day prices are not shown because they are not recorded for most issues.</p>
      </div>
    </>
  );
}
