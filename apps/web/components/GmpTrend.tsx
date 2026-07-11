import type { IpoFull } from '@/lib/api';
import { inr } from '@/lib/format';

/** GMP value + 7-day trend sparkline + estimated listing price/gain (server component). */
export function GmpTrend({ ipo }: { ipo: IpoFull }) {
  const gmp = ipo.gmp;
  if (gmp == null) return <div className="panel"><span className="muted">No grey-market data yet.</span></div>;

  const hist = ipo.gmpHistory ?? [{ day: 'Today', value: gmp }];
  const vals = hist.map((h) => h.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const W = 220, H = 54, pad = 5;
  const pts = vals.map((v, i) => {
    const x = pad + (i * (W - 2 * pad)) / Math.max(1, vals.length - 1);
    const y = H - pad - ((v - min) / Math.max(1, max - min)) * (H - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = vals[vals.length - 1] >= vals[0];
  const color = up ? 'var(--pos)' : 'var(--neg)';
  const last = pts[pts.length - 1].split(',');

  const upper = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
  const estListing = upper + gmp;
  const estGain = ipo.gmpPct ?? (upper ? Math.round((gmp / upper) * 1000) / 10 : 0);

  return (
    <div className="panel">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="muted" style={{ fontSize: 13 }}>Premium / share</div>
          <div className={`mono ${gmp >= 0 ? 'gmp-pos' : 'gmp-neg'}`} style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            {gmp >= 0 ? '+' : ''}{inr(gmp)}
          </div>
        </div>
        <svg width={W} height={H} aria-hidden="true">
          <defs>
            <linearGradient id={`gmpf-${ipo.symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon fill={`url(#gmpf-${ipo.symbol})`} points={`${pad},${H - pad} ${pts.join(' ')} ${W - pad},${H - pad}`} />
          <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts.join(' ')} />
          <circle cx={last[0]} cy={last[1]} r="3.5" fill={color} />
        </svg>
      </div>
      <div style={{ marginTop: 10 }}>
        <div className="kv"><span className="k">Est. listing price</span><span className="v mono">{inr(estListing)}</span></div>
        <div className="kv"><span className="k">Est. listing gain</span><span className={`v mono ${estGain >= 0 ? 'gmp-pos' : 'gmp-neg'}`}>{estGain >= 0 ? '+' : ''}{estGain}%</span></div>
      </div>
      <p className="disclaimer">⚠ Grey-market premium is unofficial, unregulated and not investment advice. 7-day trend shown.</p>
    </div>
  );
}
