'use client';
import { useState } from 'react';
import { useStore, store } from '@/lib/store';
import { Icon } from '@/components/Icon';
import { RemindButton } from '@/components/RemindButton';
import { inr } from '@/lib/format';
import { makeT, Lang } from '@investoyard/i18n';

function WatchButton({ symbol }: { symbol: string }) {
  const watched = useStore((s) => s.watchlist.includes(symbol));
  return (
    <button
      className="icon-btn"
      aria-pressed={watched}
      aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
      title={watched ? 'In your watchlist' : 'Add to watchlist'}
      onClick={() => store.toggleWatch(symbol)}
      style={watched ? { color: 'var(--brand)', background: 'var(--brand-50)', borderColor: 'transparent' } : undefined}
    >
      <Icon name={watched ? 'star-fill' : 'star'} size={18} />
    </button>
  );
}

const RETAIL_MAX = 200000, SNII_MAX = 1000000, UPI_MAX = 500000, DEMO_MAX = 5000000;
const catShort = (amt: number) => (amt <= RETAIL_MAX ? 'Retail' : amt <= SNII_MAX ? 'Small-NII' : 'Big-NII');

/** Sticky sidebar apply card with a live lot/amount calculator (desktop). */
export function ApplyPanel({
  symbol, status, priceLabel, minAmount, closesLabel, lotSize, priceMax, subscribedX, bidOpen, printOpen, lang = 'en', langQuery = '',
}: {
  symbol: string; status: string; priceLabel: string; minAmount?: number; closesLabel?: string | null;
  lotSize?: number; priceMax?: number; subscribedX?: number;
  /** operator "Start Bid" gate — Apply shows only when explicitly enabled */
  bidOpen?: boolean;
  /** operator "Start Printing" gate — Print PDF shows only when explicitly enabled */
  printOpen?: boolean;
  lang?: Lang; langQuery?: string;
}) {
  const tr = makeT(lang);
  const inWindow = status === 'open' || status === 'upcoming';
  const canApply = inWindow && bidOpen === true;
  const canPrint = inWindow && printOpen === true;
  const printHref = `/print/${symbol}${langQuery}`;
  const [lots, setLots] = useState(1);

  const lot = lotSize ?? 0;
  const price = priceMax ?? 0;
  const shares = lots * lot;
  const amount = shares * price;
  const canInc = lot > 0 && (lots + 1) * lot * price <= DEMO_MAX;
  const applyHref = `/apply/${symbol}?lots=${lots}${langQuery ? `&${langQuery.slice(1)}` : ''}`;

  return (
    <div className="panel summary">
      <div className="between">
        <span className="eyebrow">Apply</span>
        <WatchButton symbol={symbol} />
      </div>
      {status === 'open' && subscribedX != null && (
        <div className="sub-live-line"><span className="live-dot" />{subscribedX}× subscribed <small>· live</small></div>
      )}
      <div className="kv" style={{ marginTop: 8 }}><span className="k">Price band</span><span className="v mono">{priceLabel}</span></div>

      {canApply && lot > 0 ? (
        <>
          <div className="field" style={{ margin: '12px 0 0' }}>
            <label>Lots <span className="hint">· {lot} shares each</span></label>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="stepper">
                <button onClick={() => setLots(Math.max(1, lots - 1))} disabled={lots <= 1}>−</button>
                <span className="val mono">{lots}</span>
                <button onClick={() => setLots(lots + 1)} disabled={!canInc}>+</button>
              </div>
              <span className="muted mono">{shares} sh</span>
            </div>
          </div>
          <div className="kv" style={{ marginTop: 12 }}><span className="k">Amount</span><span className="v mono">{inr(amount)}</span></div>
          <div className="kv"><span className="k">Category</span><span className="v">{catShort(amount)}{amount > UPI_MAX ? ' · ASBA' : ''}</span></div>
          <a className="btn btn-block" href={applyHref} style={{ marginTop: 14 }}>
            {tr('detail.apply')} <Icon name="arrow-right" size={16} />
          </a>
          {canPrint && (
            <a className="btn btn-pdf btn-block" href={printHref} style={{ marginTop: 8 }}>
              Print Forms <Icon name="file-pdf" size={16} />
            </a>
          )}
        </>
      ) : (
        <>
          <div className="kv"><span className="k">{tr('label.min')} investment</span><span className="v mono">{inr(minAmount)}</span></div>
          {closesLabel && <div className="kv"><span className="k">Status</span><span className="v" style={{ color: 'var(--brand)' }}>{closesLabel}</span></div>}
          {canPrint ? (
            <a className="btn btn-pdf btn-block" href={printHref} style={{ marginTop: 16 }}>
              Print Forms <Icon name="file-pdf" size={16} />
            </a>
          ) : (
            <button className="btn btn-block" disabled style={{ marginTop: 16 }}>
              {inWindow && !canApply ? 'Bidding opens soon' : tr('detail.apply')}
            </button>
          )}
        </>
      )}
      {inWindow && <div style={{ marginTop: 10 }}><RemindButton symbol={symbol} /></div>}
      <p className="disclaimer" style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
        <Icon name="shield" size={14} style={{ marginTop: 1, flexShrink: 0 }} /> {tr('apply.selfPan')}
      </p>
    </div>
  );
}

/** Sticky bottom apply bar (mobile). */
export function ApplyBar({
  symbol, status, priceLabel, bidOpen, printOpen, lang = 'en', langQuery = '',
}: { symbol: string; status: string; priceLabel: string; bidOpen?: boolean; printOpen?: boolean; lang?: Lang; langQuery?: string }) {
  const tr = makeT(lang);
  const inWindow = status === 'open' || status === 'upcoming';
  const canApply = inWindow && bidOpen === true;
  const canPrint = inWindow && printOpen === true;
  return (
    <div className="applybar mobile-only">
      <div className="info">
        <div className="t mono">{priceLabel}</div>
        <div className="s">{canApply || canPrint ? tr('apply.selfPan') : inWindow ? 'Bidding opens soon.' : 'Applications are closed.'}</div>
      </div>
      <div className="spacer" />
      <WatchButton symbol={symbol} />
      {canPrint && (
        <a className="btn btn-pdf" href={`/print/${symbol}${langQuery}`} aria-label="Print Forms" title="Print Forms">
          {!canApply && <>Print Forms </>}<Icon name="file-pdf" size={16} />
        </a>
      )}
      {canApply
        ? <a className="btn" href={`/apply/${symbol}${langQuery}`}>{tr('detail.apply')}</a>
        : !canPrint && <button className="btn" disabled>{tr('detail.apply')}</button>}
    </div>
  );
}
