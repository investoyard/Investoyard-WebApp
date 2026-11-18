'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ArchiveRow } from '@/core/models';

const PER = 50;

export default function ArchivePage({ rows }: { rows: ArchiveRow[] }) {
  const [q, setQ] = useState('');
  const [board, setBoard] = useState('all');
  const [year, setYear] = useState('all');
  const [page, setPage] = useState(0);

  const years = useMemo(() => Array.from(new Set(rows.map((r) => r.year).filter(Boolean) as number[])).sort((a, b) => b - a), [rows]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      (board === 'all' || r.board === board) &&
      (year === 'all' || String(r.year) === year) &&
      (!s || r.name.toLowerCase().includes(s) || r.sym.toLowerCase().includes(s)));
  }, [rows, q, board, year]);
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const p = Math.min(page, pages - 1);
  const shown = list.slice(p * PER, p * PER + PER);
  const reset = () => setPage(0);

  return (
    <div className="s-wrap s-page">
      <h1 className="s-ph1">All IPOs</h1>
      <p className="s-plede">Every mainboard and SME issue we cover, newest first.</p>
      <div className="s-tools" style={{ marginTop: 28 }}>
        <label style={{ flex: '1 1 280px' }}>
          <span className="sr">Search</span>
          <input className="s-field" type="search" placeholder="Search by company or symbol" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} style={{ width: '100%' }} />
        </label>
        <label><span className="sr">Board</span>
          <select className="s-field" value={board} onChange={(e) => { setBoard(e.target.value); reset(); }}>
            <option value="all">All boards</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option>
          </select>
        </label>
        <label><span className="sr">Year</span>
          <select className="s-field" value={year} onChange={(e) => { setYear(e.target.value); reset(); }}>
            <option value="all">All years</option>
            {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </label>
      </div>

      <div className="s-table-wrap" style={{ marginTop: 20 }}>
        <table className="s-table">
          <thead><tr><th style={{ width: '34%' }}>Company</th><th>Status</th><th>Bidding</th><th className="r">Price band</th><th className="r">Issue size</th><th className="r">Subscribed</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.sym}>
                <td><Link href={r.href}><span className="s-co-name">{r.name}</span><span className="s-meta">{r.board}{r.year ? ` · ${r.year}` : ''}</span></Link></td>
                <td style={{ fontSize: 14, color: 'var(--ink2)' }}>{r.status}</td>
                <td className="num" style={{ fontSize: 14, color: 'var(--ink2)' }}>{r.dates}</td>
                <td className="r num">{r.band}</td>
                <td className="r num" style={{ color: 'var(--ink2)' }}>{r.size}</td>
                <td className="r num" style={{ fontWeight: 600 }}>{r.subs || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="s-rows">
        {shown.map((r) => (
          <li key={r.sym}>
            <Link href={r.href}>
              <span style={{ minWidth: 0 }}><span className="s-card-name" style={{ fontSize: 15 }}>{r.name}</span><span className="s-meta">{r.board} · {r.status}</span></span>
              <span className="s-rows-r"><b>{r.subs || r.band}</b><span>{r.subs ? 'Subscribed' : 'Price band'}</span></span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 ? <div className="s-empty"><p>No IPO matches</p><p>Try a different name, board or year.</p></div> : null}

      <div className="s-pager">
        <span className="num">{list.length ? `${p * PER + 1}–${Math.min(list.length, p * PER + PER)} of ${list.length.toLocaleString('en-IN')}` : '0 results'}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="s-btn s-btn-s" disabled={p === 0} onClick={() => setPage(p - 1)}>Previous</button>
          <button type="button" className="s-btn s-btn-s" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next</button>
        </span>
      </div>
    </div>
  );
}
