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
    return rows.filter((r) => (board === 'all' || r.board === board) && (year === 'all' || String(r.year) === year) && (!s || r.name.toLowerCase().includes(s) || r.sym.toLowerCase().includes(s)));
  }, [rows, q, board, year]);
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const p = Math.min(page, pages - 1);
  const shown = list.slice(p * PER, p * PER + PER);
  const reset = () => setPage(0);

  return (
    <div className="t-page">
      <section className="t-panel">
        <div className="t-ph">
          <h1>All IPOs <span className="t-muted num" style={{ fontWeight: 500, marginLeft: 6 }}>{list.length.toLocaleString('en-IN')}</span></h1>
          <div className="t-tools">
            <input className="t-input" type="search" aria-label="Search" placeholder="Search company or symbol" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} />
            <select className="t-input" aria-label="Board" value={board} onChange={(e) => { setBoard(e.target.value); reset(); }}><option value="all">All boards</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option></select>
            <select className="t-input" aria-label="Year" value={year} onChange={(e) => { setYear(e.target.value); reset(); }}><option value="all">All years</option>{years.map((y) => <option key={y} value={String(y)}>{y}</option>)}</select>
          </div>
        </div>
        {shown.length === 0 ? <div className="t-empty"><strong>No match</strong>Try a shorter name, or clear the filters.</div> : (
          <div className="t-table-wrap">
            <table className="t-table t-subt">
              <thead><tr><th>Company</th><th>Board</th><th>Status</th><th className="r">Bidding</th><th className="r">Price band</th><th className="r">Issue size</th><th className="r">Subscribed</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.sym}>
                    <td><Link className="t-co-name" href={r.href}>{r.name}</Link><span className="t-co-sub">{r.sym}</span></td>
                    <td className="t-muted">{r.board}</td>
                    <td className="t-muted">{r.status}</td>
                    <td className="r">{r.dates}</td>
                    <td className="r">{r.band}</td>
                    <td className="r">{r.size}</td>
                    <td className="r"><b>{r.subs || <span className="t-dash">—</span>}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="t-foot-row">
          <span className="num">Page {p + 1} of {pages}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="t-btn" disabled={p === 0} onClick={() => setPage(p - 1)}>Newer</button>
            <button type="button" className="t-btn" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Older</button>
          </span>
        </div>
      </section>
    </div>
  );
}
