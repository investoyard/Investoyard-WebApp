'use client';
import { useEffect, useMemo, useState } from 'react';
import { getArchive, type IpoFull } from '@/lib/api';
import { IpoCompareTable } from '@/components/IpoCompareTable';
import { Icon } from '@/components/Icon';
import { titleCase } from '@investoyard/shared-types';

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
  const [year, setYear] = useState<string>('all');
  const [month, setMonth] = useState<string>('all');
  const [board, setBoard] = useState<'all' | 'mainboard' | 'sme'>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: IpoFull[]; total: number; years: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  // a filter change always returns to page 1 — page 7 of a different filter is
  // not a place the reader asked to be
  useEffect(() => { setPage(1); }, [year, month, board, query]);

  useEffect(() => {
    let live = true;
    setBusy(true);
    // the search box debounces; the dropdowns do not need to
    const t = setTimeout(() => {
      getArchive({ year, month, board, q: query, page, perPage: PER_PAGE })
        .then((r) => { if (live) setData({ rows: r.rows, total: r.total, years: r.years }); })
        .catch(() => { if (live) setData({ rows: [], total: 0, years: [] }); })
        .finally(() => { if (live) setBusy(false); });
    }, query ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [year, month, board, query, page]);

  const years = data?.years ?? [];
  const shown = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  const reset = () => { setYear('all'); setMonth('all'); setBoard('all'); setQuery(''); };
  const filtersOn = year !== 'all' || month !== 'all' || board !== 'all' || !!query.trim();

  return (
    <section className="arch">
      <div className="arf">
        <div className="arf-f arf-grow">
          <label htmlFor="af-q">Search</label>
          <div className="arf-search">
            <Icon name="search" size={16} />
            <input id="af-q" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Company or symbol…" />
          </div>
        </div>
        <div className="arf-f">
          <label htmlFor="af-year">Year</label>
          <select id="af-year" className="input" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="arf-f">
          <label htmlFor="af-month">Month</label>
          <select id="af-month" className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">All months</option>
            {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
        </div>
        <div className="arf-f">
          <label htmlFor="af-board">Board</label>
          <select id="af-board" className="input" value={board} onChange={(e) => setBoard(e.target.value as any)}>
            <option value="all">Mainboard &amp; SME</option>
            <option value="mainboard">Mainboard</option>
            <option value="sme">SME</option>
          </select>
        </div>
        {filtersOn && (
          <div className="arf-f arf-act">
            <button className="btn btn-ghost" onClick={reset}>Clear</button>
          </div>
        )}
      </div>

      {data === null ? (
        <div className="panel" style={{ padding: 28, textAlign: 'center' }}><p className="muted">Loading the archive…</p></div>
      ) : total === 0 ? (
        <div className="empty">
          <div className="emoji">🗂️</div>
          {/* no years at all means nothing has been archived yet — a different
              thing from a filter that happens to match nothing */}
          <h3>{years.length === 0 ? 'The archive is still being built' : 'No issues match these filters'}</h3>
          <p className="muted">
            {years.length === 0
              ? 'Historical IPOs appear here as they are published to the catalog.'
              : 'Try a different year, or clear the filters.'}
          </p>
        </div>
      ) : (
        <>
          <div className="arch-count" style={busy ? { opacity: 0.55 } : undefined}>
            <b>{total.toLocaleString('en-IN')}</b> {total === 1 ? 'issue' : 'issues'}
            {year !== 'all' && <> in {month !== 'all' ? `${MONTHS[+month - 1]} ` : ''}{year}</>}
            {total > PER_PAGE && <span className="muted"> · showing {shown.length} of {total.toLocaleString('en-IN')}</span>}
          </div>
          <IpoCompareTable ipos={shown as any} archive />
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
