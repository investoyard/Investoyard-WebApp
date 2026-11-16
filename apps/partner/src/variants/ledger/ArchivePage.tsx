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
  const groups = useMemo(() => {
    const out: { year: string; rows: ArchiveRow[] }[] = [];
    for (const r of shown) {
      const y = r.year ? String(r.year) : 'Undated';
      const last = out[out.length - 1];
      if (last && last.year === y) last.rows.push(r); else out.push({ year: y, rows: [r] });
    }
    return out;
  }, [shown]);
  const reset = () => setPage(0);

  return (
    <div className="l-page">
      <h1>Archive</h1>
      <p className="l-lede"><span className="mono">{rows.length.toLocaleString('en-IN')}</span> mainboard and SME issues{years.length ? ` since ${years[years.length - 1]}` : ''}. Search by company or symbol.</p>
      <div className="l-search">
        <label><span className="sr">Search</span><input className="l-field" type="search" placeholder="Company or symbol" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} /></label>
        <label><span className="sr">Board</span><select className="l-field" value={board} onChange={(e) => { setBoard(e.target.value); reset(); }}><option value="all">All boards</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option></select></label>
        <label><span className="sr">Year</span><select className="l-field" value={year} onChange={(e) => { setYear(e.target.value); reset(); }}><option value="all">All years</option>{years.map((y) => <option key={y} value={String(y)}>{y}</option>)}</select></label>
      </div>
      <p className="l-note" role="status">{list.length.toLocaleString('en-IN')} result{list.length === 1 ? '' : 's'}</p>
      {groups.length === 0 ? <p className="l-empty">No match. Try a shorter name, or clear the filters.</p> : groups.map((g) => (
        <section key={g.year + g.rows[0].sym} className="l-year" aria-label={g.year}>
          <h2>{g.year}</h2>
          <div className="l-table-wrap">
            <table className="l-table">
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.sym}>
                    <td><Link href={r.href}>{r.name}</Link><small>{r.board} · {r.status}</small></td>
                    <td className="r hide-s">{r.dates}</td>
                    <td className="r hide-s">{r.band}</td>
                    <td className="r">{r.subs || r.size}<small>{r.subs ? 'subscribed' : 'issue size'}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {pages > 1 ? (
        <nav className="l-pager" aria-label="Pages">
          <button type="button" disabled={p === 0} onClick={() => setPage(p - 1)}>Newer</button>
          <span>Page {p + 1} of {pages}</span>
          <button type="button" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Older</button>
        </nav>
      ) : null}
    </div>
  );
}
