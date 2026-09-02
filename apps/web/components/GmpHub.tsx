'use client';
import { useEffect, useMemo, useState } from 'react';
import { getIpos, type IpoFull } from '@/lib/api';
import { IpoLogo } from '@/components/IpoLogo';
import { GmpNotice } from '@/components/GmpNotice';
import { useTenant } from '@/components/TenantProvider';
import { priceBand } from '@/lib/format';
import { LABEL, titleCase } from '@investoyard/shared-types';

/**
 * GMP hub — every IPO's grey-market premium on one calm page: ₹ premium,
 * % over the band ceiling, and the indicative listing price it implies.
 * Board + status filters; the grey market's numbers stay visually neutral
 * except the % pill (semantic). One-time GMP consent dialog applies here
 * exactly as on the explorer; page hidden for GMP-disabled tenants.
 */

type Board = 'all' | 'mainboard' | 'sme';
type Stat = 'all' | 'open' | 'upcoming' | 'closed' | 'listed';

const STATUS_ORDER: Record<string, number> = { open: 0, upcoming: 1, closed: 2, listed: 3, withdrawn: 4 };

function statusWord(s: string): string {
  return s === 'open' ? 'Live' : s.charAt(0).toUpperCase() + s.slice(1);
}

export function GmpHub({ ipos: baked }: { ipos: IpoFull[] }) {
  const tenant = useTenant();
  const [ipos, setIpos] = useState<IpoFull[]>(baked);
  const [board, setBoard] = useState<Board>('all');
  const [stat, setStat] = useState<Stat>('all');
  useEffect(() => { getIpos().then((live) => { if (live?.length) setIpos(live as IpoFull[]); }).catch(() => {}); }, []);

  const rows = useMemo(() => {
    return ipos
      .filter((i) => i.gmp != null || i.gmpPct != null)
      .filter((i) => (board === 'all' ? true : i.type === board))
      .filter((i) => (stat === 'all' ? true : i.status === stat))
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  }, [ipos, board, stat]);

  if (!tenant.flags.gmpEnabled) {
    return <div className="panel" style={{ padding: 28, textAlign: 'center' }}><p className="muted">Grey-market data is not available on this platform.</p></div>;
  }

  const est = (i: IpoFull) => {
    const base = i.priceBandMax ?? i.priceBandMin;
    return base != null && i.gmp != null ? `₹${Math.round(base + i.gmp).toLocaleString('en-IN')}` : '—';
  };
  const pct = (i: IpoFull) => (i.gmpPct ?? i.gmp ?? 0);

  return (
    <div className="gh">
      <GmpNotice />
      <div className="gh-head">
        <div>
          <h1>Grey Market Premium</h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
            Unofficial grey-market premium per IPO, the % it implies over the band ceiling, and the indicative listing price.
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
        <div className="cal-seg" role="tablist" aria-label="Status">
          {(['all', 'open', 'upcoming', 'closed', 'listed'] as Stat[]).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={stat === s}
              className={`cal-seg-btn ${stat === s ? 'on' : ''}`} onClick={() => setStat(s)}>
              {s === 'all' ? 'All' : statusWord(s)}
            </button>
          ))}
        </div>
      </div>

      <div className="panel gh-table">
        <div className="gh-row gh-thead">
          <span>IPO</span>
          <span className="gh-col">{LABEL.offerPrice}</span>
          <span className="gh-col">{LABEL.gmp}</span>
          <span className="gh-col">Over band</span>
          <span className="gh-col">Est. listing</span>
        </div>
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: '22px 0', textAlign: 'center' }}>No grey-market figures for this filter yet.</p>
        ) : rows.map((i) => (
          <a className="gh-row" key={i.id} href={`/ipos/${i.symbol}`}>
            <span className="gh-ipo">
              <IpoLogo logo={(i as any).logo} name={i.name} size={32} />
              <span className="gh-name-wrap">
                <span className="gh-name" title={titleCase(i.name)}>{titleCase(i.name)}</span>
                <span className="gh-meta">{i.type === 'sme' ? 'SME' : 'Mainboard'} · {statusWord(i.status)}</span>
              </span>
            </span>
            <span className="gh-col mono">{priceBand(i.priceBandMin, i.priceBandMax)}</span>
            <span className="gh-col mono gh-gmp">{i.gmp != null ? `${i.gmp >= 0 ? '+' : ''}₹${i.gmp}` : '—'}</span>
            <span className="gh-col"><span className={`gmp-pill ${pct(i) >= 0 ? 'gp' : 'gn'}`}>{pct(i) >= 0 ? '+' : ''}{pct(i)}%</span></span>
            <span className="gh-col mono gh-est">{est(i)}</span>
          </a>
        ))}
        <p className="disclaimer" style={{ margin: '12px 2px 2px' }}>
          GMP is unofficial and unregulated grey-market data, shown for information only — it is not investment advice and listing prices can differ materially. Indicative listing = band ceiling + GMP.
        </p>
      </div>
    </div>
  );
}
