'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ArchiveRow } from '@/core/models';

const PER = 60;

export default function ArchivePage({ rows }: { rows: ArchiveRow[] }) {
  const [q, setQ] = useState('');
  const [board, setBoard] = useState('all');
  const [year, setYear] = useState('all');
  const [page, setPage] = useState(0);
  const years = useMemo(() => Array.from(new Set(rows.map((r) => r.year).filter(Boolean) as number[])).sort((a, b) => b - a), [rows]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (board === 'all' || r.board === board) && (year === 'all' || String(r.year) === year) && (!s || r.name.toLowerCase().includes(s) || r.sym.toLowerCase().includes(s)));
  }, [rows, q, board, year]);
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const p = Math.min(page, pages - 1);
  const shown = list.slice(p * PER, p * PER + PER);

  return (
    <div className="t-page">
      <section className="t-panel">
        <div className="t-ph">
          <h1>All IPOs</h1>
          <div className="t-tools">
            <label><span className="sr">Search</span><input className="t-input" type="search" placeholder="Symbol or company" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></label>
            <label><span className="sr">Board</span><select className="t-input" value={board} onChange={(e) => { setBoard(e.target.value); setPage(0); }}><option value="all">All boards</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option></select></label>
            <label><span className="sr">Year</span><select className="t-input" value={year} onChange={(e) => { setYear(e.target.value); setPage(0); }}><option value="all">All years</option>{years.map((y) => <option key={y} value={String(y)}>{y}</option>)}</select></label>
          </div>
        </div>
        <div className="t-table-wrap t-hide-m">
          <table className="t-table">
            <thead><tr><th>Symbol</th><th>Company</th><th>Board</th><th>Status</th><th>Bidding</th><th className="r">Price band</th><th className="r">Size</th><th className="r">Subscribed</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.sym}>
                  <td><Link href={r.href} className="t-sym mono">{r.sym}</Link></td>
                  <td><Link href={r.href} className="t-co">{r.name}</Link></td>
                  <td><span className="t-board">{r.board}</span></td>
                  <td className="t-muted">{r.status}</td>
                  <td className="mono t-muted">{r.dates}{r.year ? ` ${r.year}` : ''}</td>
                  <td className="r mono">{r.band}</td>
                  <td className="r mono">{r.size}</td>
                  <td className="r mono" style={{ fontWeight: 600 }}>{r.subs || <span className="t-dash">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="t-mrows">
          {shown.map((r) => (
            <li key={r.sym}><Link href={r.href}><span className="t-sym mono">{r.sym}</span><span className="t-mr-v mono">{r.subs || r.band}</span><span className="t-mr-s">{r.name} · {r.status}</span></Link></li>
          ))}
        </ul>
        {shown.length === 0 ? <div className="t-empty"><strong>No issue matches</strong>Change the search, board or year.</div> : null}
        <div className="t-more">
          <span className="mono">{list.length ? `${p * PER + 1}–${Math.min(list.length, p * PER + PER)} / ${list.length}` : '0 results'}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="t-btn t-btn-s" disabled={p === 0} onClick={() => setPage(p - 1)}>Prev</button>
            <button type="button" className="t-btn t-btn-s" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next</button>
          </span>
        </div>
      </section>
    </div>
  );
}
