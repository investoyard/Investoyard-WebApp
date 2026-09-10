'use client';
import { useEffect, useMemo, useState } from 'react';
import { getIpos, type IpoFull } from '@/lib/api';
import { subscriptionTable } from '@/lib/ipoCalc';
import { IpoLogo } from '@/components/IpoLogo';
import { demandLabel } from '@/components/IpoCard';
import { titleCase } from '@investoyard/shared-types';

/**
 * Live subscription hub — who's bidding, right now. One instrument panel per
 * open IPO: overall × with our calibrated demand word, category rows
 * (QIB / NII / Retail) as quiet track bars with shares offered vs bid, and the
 * poller's as-of stamp. Recently closed issues follow as final-figure rows.
 * Auto-refreshes every 60s while the page is open.
 */

const CAT_LABEL: Record<string, string> = { qib: 'QIB', nii: 'NII (HNI)', retail: 'Retail', employee: 'Employee' };

const shFmt = (n: number) =>
  n >= 1e7 ? `${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(2)} L` : Math.round(n).toLocaleString('en-IN');

const asOfFmt = (s?: string) => {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });
};

export function SubscriptionHub({ ipos: baked }: { ipos: IpoFull[] }) {
  const [ipos, setIpos] = useState<IpoFull[]>(baked);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => getIpos().then((live) => { if (alive && live?.length) setIpos(live as IpoFull[]); }).catch(() => {});
    load();
    const t = setInterval(() => { load(); setTick((n) => n + 1); }, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const open = useMemo(() => ipos.filter((i) => i.status === 'open' && (i.subscription?.length || i.subscriptionTimes != null)), [ipos]);
  const closed = useMemo(
    () => ipos.filter((i) => (i.status === 'closed' || i.status === 'listed') && i.subscriptionTimes != null).slice(0, 8),
    [ipos],
  );

  return (
    <div className="sh" data-tick={tick}>
      <div className="gh-head">
        <div>
          <h1>Live Subscription</h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
            Category-wise demand for every open issue, from the exchange feed — refreshes every minute while you&apos;re here.
          </p>
        </div>
      </div>

      {open.length === 0 ? (
        <div className="panel" style={{ padding: 26, textAlign: 'center', marginTop: 18 }}>
          <p className="muted">No issue is open for bidding right now — check <a className="linklike" href="/calendar">the calendar</a> for what opens next.</p>
        </div>
      ) : (
        open.map((ipo) => {
          const table = subscriptionTable(ipo);
          const totalX = table?.total.times ?? ipo.subscriptionTimes ?? 0;
          const dm = demandLabel(totalX, ipo.type === 'sme');
          const maxX = Math.max(1, ...(table?.rows.map((r) => r.times) ?? [totalX]));
          const asOf = asOfFmt((ipo as any).subscriptionAsOf);
          return (
            <div className="panel sh-card" key={ipo.id}>
              <div className="sh-top">
                <a className="sh-ipo" href={`/ipos/${ipo.slug ?? ipo.symbol}`}>
                  <IpoLogo logo={(ipo as any).logo} name={ipo.name} size={38} />
                  <span className="gh-name-wrap">
                    <span className="gh-name" title={titleCase(ipo.name)}>{titleCase(ipo.name)}</span>
                    <span className="gh-meta">{ipo.type === 'sme' ? 'SME' : 'Mainboard'} · closes {ipo.closeDate ? new Date(`${ipo.closeDate}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</span>
                  </span>
                </a>
                <span className={`ic-subx2 ${dm.cls} sh-total`}><b className="mono">{totalX}×</b> {dm.label}</span>
              </div>

              {table ? (
                <div className="sh-rows">
                  {table.rows.map((r) => (
                    <div className="sh-catrow" key={r.cat}>
                      <span className="sh-cat">{CAT_LABEL[r.cat] ?? r.cat.toUpperCase()}</span>
                      <span className="sh-track"><i style={{ width: `${Math.max(4, Math.min(100, (r.times / maxX) * 100))}%` }} /></span>
                      <span className="sh-x mono">{r.times}×</span>
                      <span className="sh-sh mono">{shFmt(r.subscribed)} / {shFmt(r.bookSize)} sh</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Category-wise figures arrive once the exchange publishes them.</p>
              )}
              {asOf && <p className="sh-asof">Updated {asOf}</p>}
            </div>
          );
        })
      )}

      {closed.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 34 }}><h2>Recently closed — final figures</h2></div>
          <div className="panel gh-table">
            {closed.map((i) => {
              const dm = demandLabel(i.subscriptionTimes!, i.type === 'sme');
              return (
                <a className="sh-closedrow" key={i.id} href={`/ipos/${i.slug ?? i.symbol}`}>
                  <span className="gh-ipo">
                    <IpoLogo logo={(i as any).logo} name={i.name} size={30} />
                    <span className="gh-name-wrap">
                      <span className="gh-name" title={titleCase(i.name)}>{titleCase(i.name)}</span>
                      <span className="gh-meta">{i.type === 'sme' ? 'SME' : 'Mainboard'} · {i.status === 'listed' ? 'Listed' : 'Closed'}</span>
                    </span>
                  </span>
                  <span className={`ic-subx2 ${dm.cls}`}><b className="mono">{i.subscriptionTimes}×</b> {dm.label}</span>
                </a>
              );
            })}
          </div>
        </>
      )}

      <p className="disclaimer" style={{ marginTop: 14 }}>
        Subscription figures are compiled from exchange-published data and can lag the live book, especially in the final hours of closing day.
      </p>
    </div>
  );
}
