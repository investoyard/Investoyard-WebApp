'use client';
import { useEffect, useMemo, useState } from 'react';
import { getIpos, type IpoFull } from '@/lib/api';
import { IpoLogo } from '@/components/IpoLogo';
import { priceBand } from '@/lib/format';

/**
 * IPO Performance — how every debut actually went: issue price vs listing
 * price vs gain, sortable, filterable by board. (A current-market-price
 * column joins once a live price feed exists.)
 */

type Sort = 'date' | 'gain-desc' | 'gain-asc';
type Board = 'all' | 'mainboard' | 'sme';

interface Row { ipo: IpoFull; issue: number; listing: number | null; gain: number | null }

function toRow(ipo: IpoFull): Row | null {
  const issue = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
  if (!issue) return null;
  const ex: any = (ipo as any).extra ?? {};
  const listing = Number(String(ex.nseListingPrice || ex.bseListingPrice || '').replace(/[^\d.]/g, '')) ||
    (ipo.listingGainPct != null ? Math.round(issue * (1 + ipo.listingGainPct / 100)) : null);
  const gain = ipo.listingGainPct ?? (listing ? Math.round(((listing - issue) / issue) * 1000) / 10 : null);
  return { ipo, issue, listing: listing || null, gain };
}

export function PerformanceHub({ ipos: baked }: { ipos: IpoFull[] }) {
  const [ipos, setIpos] = useState<IpoFull[]>(baked);
  const [board, setBoard] = useState<Board>('all');
  const [sort, setSort] = useState<Sort>('date');
  useEffect(() => { getIpos().then((live) => { if (live?.length) setIpos(live as IpoFull[]); }).catch(() => {}); }, []);

  const rows = useMemo(() => {
    const out = ipos
      .filter((i) => i.status === 'listed')
      .filter((i) => (board === 'all' ? true : i.type === board))
      .map(toRow)
      .filter((r): r is Row => r != null && r.gain != null);
    if (sort === 'gain-desc') out.sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0));
    else if (sort === 'gain-asc') out.sort((a, b) => (a.gain ?? 0) - (b.gain ?? 0));
    else out.sort((a, b) => (String(b.ipo.listingDate ?? '') < String(a.ipo.listingDate ?? '') ? -1 : 1));
    return out;
  }, [ipos, board, sort]);

  const fmtD = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  return (
    <div className="gh">
      <div className="gh-head">
        <div>
          <h1>IPO Performance</h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
            How every debut actually went — issue price against the real listing price.
          </p>
        </div>
      </div>

      <div className="gh-filters">
        <div className="cal-seg" role="tablist" aria-label="Board">
          {(['all', 'mainboard', 'sme'] as Board[]).map((b) => (
            <button key={b} type="button" role="tab" aria-selected={board === b}
              className={`cal-seg-btn ${board === b ? 'on' : ''}`} onClick={() => setBoard(b)}>
              {b === 'all' ? 'All' : b === 'mainboard' ? 'Mainboard' : 'SME'}
            </button>
          ))}
        </div>
        <div className="cal-seg" role="tablist" aria-label="Sort">
          {([['date', 'Newest'], ['gain-desc', 'Best listing'], ['gain-asc', 'Worst listing']] as [Sort, string][]).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={sort === k}
              className={`cal-seg-btn ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel gh-table">
        <div className="pf2-row gh-thead">
          <span>IPO</span>
          <span className="gh-col">Listed</span>
          <span className="gh-col">Issue price</span>
          <span className="gh-col">Listing price</span>
          <span className="gh-col">Listing gain</span>
        </div>
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: '22px 0', textAlign: 'center' }}>No listed issues with performance data yet.</p>
        ) : rows.map((r) => (
          <a className="pf2-row" key={r.ipo.id} href={`/ipos/${r.ipo.symbol}`}>
            <span className="gh-ipo">
              <IpoLogo logo={(r.ipo as any).logo} name={r.ipo.name} size={32} />
              <span className="gh-name-wrap">
                <span className="gh-name" title={r.ipo.name}>{r.ipo.name}</span>
                <span className="gh-meta">{r.ipo.type === 'sme' ? 'SME' : 'Mainboard'} · band {priceBand(r.ipo.priceBandMin, r.ipo.priceBandMax)}</span>
              </span>
            </span>
            <span className="gh-col gh-meta2">{fmtD(r.ipo.listingDate)}</span>
            <span className="gh-col mono">₹{r.issue.toLocaleString('en-IN')}</span>
            <span className="gh-col mono" style={{ fontWeight: 700 }}>{r.listing ? `₹${r.listing.toLocaleString('en-IN')}` : '—'}</span>
            <span className="gh-col"><span className={`gmp-pill ${r.gain! >= 0 ? 'gp' : 'gn'}`}>{r.gain! >= 0 ? '+' : ''}{r.gain}%</span></span>
          </a>
        ))}
        <p className="disclaimer" style={{ margin: '12px 2px 2px' }}>
          Listing gain compares the issue price (band ceiling) with the listing price on debut. Past performance does not indicate future results.
        </p>
      </div>
    </div>
  );
}
