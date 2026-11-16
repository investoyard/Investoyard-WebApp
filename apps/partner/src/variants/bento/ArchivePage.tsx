'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ArchiveRow } from '@/core/models';

const PER = 40;

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
    <div className="b-page">
      <section className="b-ph">
        <h1 className="disp">All IPOs</h1>
        <p>Every mainboard and SME issue we cover, newest first.</p>
        <div className="b-search">
          <label><span className="sr">Search</span><input className="b-field" type="search" placeholder="Search company or symbol" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></label>
          <label><span className="sr">Board</span><select className="b-field" value={board} onChange={(e) => { setBoard(e.target.value); setPage(0); }}><option value="all">All boards</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option></select></label>
          <label><span className="sr">Year</span><select className="b-field" value={year} onChange={(e) => { setYear(e.target.value); setPage(0); }}><option value="all">All years</option>{years.map((y) => <option key={y} value={String(y)}>{y}</option>)}</select></label>
        </div>
      </section>
      <div className="b-rows">
        {shown.map((r) => (
          <Link key={r.sym} href={r.href} className="b-row" style={{ gridTemplateColumns: 'minmax(0,2.4fr) minmax(0,1.4fr) repeat(3, minmax(0,1fr))' }}>
            <span className="b-row-co"><span style={{ minWidth: 0 }}><strong>{r.name}</strong><span style={{ fontSize: 13, color: 'var(--muted)' }}>{r.board}{r.year ? ` · ${r.year}` : ''} · {r.status}</span></span></span>
            <span className="b-row-v" style={{ textAlign: 'left', fontWeight: 400, color: 'var(--ink2)' }}>{r.dates}</span>
            <span className="b-row-v">{r.band}</span>
            <span className="b-row-v">{r.size}</span>
            <span className="b-row-v b-row-key">{r.subs || '—'}<small>subscribed</small></span>
          </Link>
        ))}
      </div>
      {shown.length === 0 ? <div className="b-empty"><strong className="disp">No IPO matches</strong><p>Try a different name, board or year.</p></div> : null}
      <div className="b-pager">
        <span className="num">{list.length ? `${p * PER + 1}–${Math.min(list.length, p * PER + PER)} of ${list.length.toLocaleString('en-IN')}` : '0 results'}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="b-btn b-btn-s" disabled={p === 0} onClick={() => setPage(p - 1)}>Previous</button>
          <button type="button" className="b-btn b-btn-s" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next</button>
        </span>
      </div>
    </div>
  );
}
