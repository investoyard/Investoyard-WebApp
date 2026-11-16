'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ArchiveRow } from '@/core/models';

const PER = 60;

/* A search band, then the catalogue grouped under giant year headings. */
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
    <>
      <section className="h-on h-phero" aria-labelledby="ar-h">
        <div className="h-wrap">
          <p className="h-eyebrow h-soft">Archive</p>
          <h1 id="ar-h" className="dsp">{years.length ? `Every IPO since ${years[years.length - 1]}.` : 'Every IPO.'}</h1>
          <p className="h-soft"><span className="num">{rows.length.toLocaleString('en-IN')}</span> mainboard and SME issues. Search by company or symbol.</p>
          <div className="h-search">
            <label><span className="sr">Search</span><input className="h-field" type="search" placeholder="Company or symbol" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} /></label>
            <label><span className="sr">Board</span><select className="h-field" value={board} onChange={(e) => { setBoard(e.target.value); reset(); }}><option value="all">All boards</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option></select></label>
            <label><span className="sr">Year</span><select className="h-field" value={year} onChange={(e) => { setYear(e.target.value); reset(); }}><option value="all">All years</option>{years.map((y) => <option key={y} value={String(y)}>{y}</option>)}</select></label>
          </div>
        </div>
      </section>
      <div className="h-wrap" style={{ paddingTop: 24, paddingBottom: 88 }}>
        <p className="h-dim num" role="status" style={{ marginTop: 24 }}>{list.length.toLocaleString('en-IN')} result{list.length === 1 ? '' : 's'}</p>
        {groups.length === 0 ? <div className="h-empty"><strong className="dsp">No match</strong><p>Try a shorter name, or clear the filters.</p></div> : groups.map((g) => (
          <section key={g.year + g.rows[0].sym} className="h-year" aria-label={g.year}>
            <h2 className="dsp num">{g.year}</h2>
            <div>
              {g.rows.map((r) => (
                <Link key={r.sym} className="h-line h-aline" href={r.href}>
                  <div style={{ minWidth: 0 }}>
                    <div className="h-line-name dsp">{r.name}</div>
                    <div className="h-dim" style={{ marginTop: 4 }}>{r.board} · {r.status}</div>
                  </div>
                  <div className="h-line-v num">{r.dates}<small>Bidding</small></div>
                  <div className="h-line-v num">{r.band}<small>Price band</small></div>
                  <div className="h-line-v num">{r.size}<small>Issue size</small></div>
                  <div className="h-line-v h-line-key num">{r.subs || '—'}<small>Subscribed</small></div>
                </Link>
              ))}
            </div>
          </section>
        ))}
        {pages > 1 ? (
          <nav className="h-pager" aria-label="Pages">
            <button type="button" className="h-tab" disabled={p === 0} onClick={() => setPage(p - 1)}>Newer</button>
            <span className="num">Page {p + 1} of {pages}</span>
            <button type="button" className="h-tab" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Older</button>
          </nav>
        ) : null}
      </div>
    </>
  );
}
