'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ArchiveRow } from '@/core/models';
import { BoardTag, Hero, Icon, Logo } from './parts';

const PER = 20;

export default function ArchivePage({ rows }: { rows: ArchiveRow[] }) {
  const [q, setQ] = useState('');
  const [board, setBoard] = useState('all');
  const [year, setYear] = useState('all');
  const [page, setPage] = useState(0);
  /* The header search lands here with ?q=; read it after mount so the static page and the browser agree. */
  useEffect(() => {
    try { const v = new URLSearchParams(window.location.search).get('q'); if (v) setQ(v); } catch { /* ignore */ }
  }, []);
  const years = useMemo(() => Array.from(new Set(rows.map((r) => r.year).filter(Boolean) as number[])).sort((a, b) => b - a), [rows]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (board === 'all' || r.board === board) && (year === 'all' || String(r.year) === year) && (!s || r.name.toLowerCase().includes(s) || r.sym.toLowerCase().includes(s)));
  }, [rows, q, board, year]);
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const p = Math.min(page, pages - 1);
  const shown = list.slice(p * PER, p * PER + PER);
  const reset = () => { setQ(''); setBoard('all'); setYear('all'); setPage(0); };
  const thisYear = years[0];
  const stat = {
    total: rows.length,
    main: rows.filter((r) => r.board === 'Mainboard').length,
    sme: rows.filter((r) => r.board === 'SME').length,
    year: thisYear ? rows.filter((r) => r.year === thisYear).length : 0,
  };
  /* Numbered pages: first, last, and two either side of the current one. */
  const nums = Array.from(new Set([0, pages - 1, p - 2, p - 1, p, p + 1, p + 2].filter((n) => n >= 0 && n < pages))).sort((a, b) => a - b);

  return (
    <>
      <Hero icon="layers" title="IPO archive" sub={`Explore ${stat.total.toLocaleString('en-IN')} mainboard and SME IPOs${years.length ? ` since ${years[years.length - 1]}` : ''}, with dates, price bands, issue size and subscription.`} />
      <div className="p-wrap p-main">
        <dl className="p-stats">
          <div className="p-stat"><span className="p-tile"><Icon name="layers" size={24} /></span><div className="p-stat-t"><dt>Total IPOs</dt><dd>{stat.total.toLocaleString('en-IN')}</dd></div></div>
          <div className="p-stat"><span className="p-tile"><Icon name="building" size={24} /></span><div className="p-stat-t"><dt>Mainboard</dt><dd>{stat.main.toLocaleString('en-IN')}</dd></div></div>
          <div className="p-stat"><span className="p-tile pos"><Icon name="chart" size={24} /></span><div className="p-stat-t"><dt>SME</dt><dd>{stat.sme.toLocaleString('en-IN')}</dd></div></div>
          <div className="p-stat"><span className="p-tile amber"><Icon name="calendar" size={24} /></span><div className="p-stat-t"><dt>{thisYear ? `In ${thisYear}` : 'This year'}</dt><dd>{stat.year.toLocaleString('en-IN')}</dd></div></div>
        </dl>

        <div className="p-card p-filterbar" style={{ marginTop: 22 }}>
          <span className="p-input-wrap" style={{ flex: '1 1 260px' }}><Icon name="search" size={17} /><input className="p-input" style={{ width: '100%' }} type="search" aria-label="Search by company or symbol" placeholder="Search by company or symbol" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></span>
          <label>Year<select className="p-select" value={year} onChange={(e) => { setYear(e.target.value); setPage(0); }}><option value="all">All years</option>{years.map((y) => <option key={y} value={String(y)}>{y}</option>)}</select></label>
          <label>Board<select className="p-select" value={board} onChange={(e) => { setBoard(e.target.value); setPage(0); }}><option value="all">All (Mainboard &amp; SME)</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option></select></label>
          <button type="button" className="p-btn p-btn-sm" onClick={reset}><Icon name="refresh" size={16} />Reset</button>
        </div>

        <section className="p-card" style={{ marginTop: 22 }} aria-label="IPOs">
          {shown.length === 0 ? <div className="p-empty"><strong>No match</strong>Try a shorter name, or reset the filters.</div> : (
            <div className="p-table-wrap">
              <table className="p-table">
                <thead><tr><th className="c hide-s">#</th><th>Company / IPO</th><th>Board</th><th className="hide-s">Issue dates</th><th className="r hide-s">Price band (₹)</th><th className="r hide-s">Issue size</th><th className="r">Subscribed</th><th className="hide-s">Status</th></tr></thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={r.sym}>
                      <td className="c p-muted num hide-s">{p * PER + i + 1}</td>
                      <td><div className="p-co"><Logo ipo={r} /><Link href={r.href}>{r.name}</Link></div></td>
                      <td><BoardTag board={r.board} /></td>
                      <td className="hide-s num">{r.dates}</td>
                      <td className="r hide-s">{r.band.replace('₹', '')}</td>
                      <td className="r hide-s">{r.size}</td>
                      <td className="r">{r.subs ? <span className="p-badge">{r.subs}</span> : <span className="p-muted">—</span>}</td>
                      <td className="hide-s p-muted">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="p-more" style={{ margin: 0, padding: '16px 20px', borderTop: '1px solid var(--line2)' }}>
            <span className="p-muted num">Showing {list.length ? p * PER + 1 : 0}–{p * PER + shown.length} of {list.length.toLocaleString('en-IN')} IPOs</span>
            {pages > 1 ? (
              <nav className="p-pager" aria-label="Pages">
                <button type="button" aria-label="Previous page" disabled={p === 0} onClick={() => setPage(p - 1)}>‹</button>
                {nums.map((n, i) => (
                  <span key={n} style={{ display: 'contents' }}>
                    {i > 0 && n - nums[i - 1] > 1 ? <span className="p-muted" aria-hidden="true">…</span> : null}
                    <button type="button" aria-current={n === p ? 'page' : undefined} onClick={() => setPage(n)}>{n + 1}</button>
                  </span>
                ))}
                <button type="button" aria-label="Next page" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>›</button>
              </nav>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
