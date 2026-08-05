'use client';
import { useEffect, useState } from 'react';

const PER_OPTIONS = [10, 25, 50, 100];

/** Client-side pagination with a "N / page" selector and an entries count. */
export function usePagination<T>(rows: T[], defaultPer = 10): { slice: T[]; node: React.ReactNode } {
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(defaultPer);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  useEffect(() => { setPage(1); }, [rows.length, per]);
  const cur = Math.min(page, pages);
  const slice = rows.slice((cur - 1) * per, cur * per);
  const from = rows.length === 0 ? 0 : (cur - 1) * per + 1;
  const to = Math.min(cur * per, rows.length);
  const node = rows.length > 0
    ? <Pager page={cur} pages={pages} from={from} to={to} total={rows.length} per={per} onPage={setPage} onPer={setPer} />
    : null;
  return { slice, node };
}

function Pager({ page, pages, from, to, total, per, onPage, onPer }: {
  page: number; pages: number; from: number; to: number; total: number; per: number; onPage: (p: number) => void; onPer: (p: number) => void;
}) {
  const nums: (number | '…')[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <div className="pager">
      <span className="pager-info">Showing <b>{from}</b> to <b>{to}</b> of <b>{total}</b> entries</span>
      <div className="pager-right">
        {pages > 1 && (
          <div className="pager-btns">
            <button className="pg" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous">‹</button>
            {nums.map((n, i) => n === '…'
              ? <span key={`d${i}`} className="pg-dots">…</span>
              : <button key={n} className={`pg${n === page ? ' on' : ''}`} onClick={() => onPage(n)}>{n}</button>)}
            <button className="pg" disabled={page === pages} onClick={() => onPage(page + 1)} aria-label="Next">›</button>
          </div>
        )}
        <select className="pager-per input" value={per} onChange={(e) => onPer(Number(e.target.value))} aria-label="Rows per page">
          {PER_OPTIONS.map((p) => <option key={p} value={p}>{p} / page</option>)}
        </select>
      </div>
    </div>
  );
}
