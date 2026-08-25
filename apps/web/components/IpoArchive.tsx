'use client';
import { useEffect, useMemo, useState } from 'react';
import { getIpos, type IpoFull } from '@/lib/api';
import { IpoCompareTable } from '@/components/IpoCompareTable';
import { Icon } from '@/components/Icon';
import { compareForList, titleCase } from '@investoyard/shared-types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PER_PAGE = 50;

/** The date an archived issue is filed under — listing day, else close, else open. */
const fileDate = (i: IpoFull): string => (i as any).listingDate ?? i.closeDate ?? i.openDate ?? '';

/**
 * IPO archive — every past issue, filterable by year, month and board.
 * The main list only carries the last six months; this is where the full
 * catalog lives once historical data is published. Table layout by default:
 * scanning hundreds of rows is exactly what it's for.
 */
export function IpoArchive() {
  const [ipos, setIpos] = useState<IpoFull[] | null>(null);
  const [year, setYear] = useState<string>('all');
  const [month, setMonth] = useState<string>('all');
  const [board, setBoard] = useState<'all' | 'mainboard' | 'sme'>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { getIpos().then((r) => setIpos(r as IpoFull[])).catch(() => setIpos([])); }, []);

  // finished issues only — anything still in play belongs on the main list
  const past = useMemo(
    () => (ipos ?? []).filter((i) => i.status === 'listed' || i.status === 'closed'),
    [ipos],
  );

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const i of past) { const d = fileDate(i); if (d) set.add(d.slice(0, 4)); }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [past]);

  const rows = useMemo(() => {
    const ql = query.trim().toLowerCase();
    const out = past.filter((i) => {
      const d = fileDate(i);
      if (year !== 'all' && d.slice(0, 4) !== year) return false;
      if (month !== 'all' && d.slice(5, 7) !== month) return false;
      if (board !== 'all' && i.type !== board) return false;
      if (ql && !`${i.name} ${i.symbol}`.toLowerCase().includes(ql)) return false;
      return true;
    });
    return out.sort(compareForList);
  }, [past, year, month, board, query]);

  useEffect(() => { setPage(1); }, [year, month, board, query]);

  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const shown = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const reset = () => { setYear('all'); setMonth('all'); setBoard('all'); setQuery(''); };
  const filtersOn = year !== 'all' || month !== 'all' || board !== 'all' || !!query.trim();

  return (
    <section className="arch">
      <div className="arch-filters">
        <div className="af">
          <label htmlFor="af-year">Year</label>
          <select id="af-year" className="input" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="af">
          <label htmlFor="af-month">Month</label>
          <select id="af-month" className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">All months</option>
            {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
        </div>
        <div className="af">
          <label htmlFor="af-board">Board</label>
          <select id="af-board" className="input" value={board} onChange={(e) => setBoard(e.target.value as any)}>
            <option value="all">Mainboard &amp; SME</option>
            <option value="mainboard">Mainboard</option>
            <option value="sme">SME</option>
          </select>
        </div>
        <div className="af grow">
          <label htmlFor="af-q">Search</label>
          <div className="search">
            <Icon name="search" size={16} />
            <input id="af-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Company or symbol…" />
          </div>
        </div>
        {filtersOn && <button className="btn btn-ghost btn-sm arch-reset" onClick={reset}>Clear</button>}
      </div>

      {ipos === null ? (
        <div className="panel" style={{ padding: 28, textAlign: 'center' }}><p className="muted">Loading the archive…</p></div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <div className="emoji">🗂️</div>
          <h3>{past.length === 0 ? 'The archive is still being built' : 'No issues match these filters'}</h3>
          <p className="muted">
            {past.length === 0
              ? 'Historical IPOs appear here as they are published to the catalog.'
              : 'Try a different year, or clear the filters.'}
          </p>
        </div>
      ) : (
        <>
          <div className="arch-count">
            <b>{rows.length.toLocaleString('en-IN')}</b> {rows.length === 1 ? 'issue' : 'issues'}
            {year !== 'all' && <> in {month !== 'all' ? `${MONTHS[+month - 1]} ` : ''}{year}</>}
            {rows.length > PER_PAGE && <span className="muted"> · showing {shown.length} of {rows.length.toLocaleString('en-IN')}</span>}
          </div>
          <IpoCompareTable ipos={shown as any} />
          {pages > 1 && (
            <div className="arch-pager">
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
              <span className="muted">Page {page} of {pages.toLocaleString('en-IN')}</span>
              <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
