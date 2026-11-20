'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

const RANGE: [number, string][] = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']];
const MODES: [string, string][] = [['', 'Test and live'], ['test', 'Test'], ['live', 'Live']];
const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;

/** What a status looks like. The words are ours; the colour only says good, waiting or bad. */
const STATUS: Record<string, [string, string]> = {
  submitted: ['queued', 'mut'],
  mandate_pending: ['awaiting mandate', 'warn'],
  upi_blocked: ['funds blocked', 'ok'],
  dp_verified: ['demat verified', 'ok'],
  confirmed: ['confirmed', 'ok'],
  allotted: ['allotted', 'ok'],
  not_allotted: ['not allotted', 'mut'],
  released: ['refunded', 'mut'],
  cancelled: ['cancelled', 'mut'],
  rejected: ['rejected', 'bad'],
  failed: ['failed', 'bad'],
  dp_failed: ['demat failed', 'bad'],
};

/**
 * Partner bids (Phase 2) — every bid a partner placed through the API, test
 * and live, newest first. A partner login sees only its own.
 */
export default function PartnerBidsPage() {
  const me = useOperator();
  const [data, setData] = useState<api.PartnerReport<api.PartnerBidRow> | null>(null);
  const [tenants, setTenants] = useState<api.PartnerRow[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [mode, setMode] = useState('');
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.fetchPartnerBids({ tenantId: tenantId || undefined, mode: mode || undefined, days, page })
      .then((d) => { setData(d); setErr(null); })
      .catch((e) => setErr(String(e?.message ?? e)));
  }, [tenantId, mode, days, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.fetchTenants().then(setTenants).catch(() => {}); }, []);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'partner-api.prints.view')) return <NoAccess />;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;

  return (
    <div style={{ maxWidth: 1360 }}>
      <PageHead
        title="Partner API — Bids"
        sub="Bids placed through the API. Test bids went to the simulator and never reached an exchange."
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="tbl-toolbar">
        {data?.scoped ? (
          <span className="st lock"><Icon name="lock" size={12} /><span className="st-key">Scope:</span> {me.homeTenant?.name ?? 'your organisation'}</span>
        ) : data && (
          <select className="input" style={{ minWidth: 220, maxWidth: 260 }} value={tenantId}
            onChange={(e) => { setTenantId(e.target.value); setPage(1); }}>
            <option value="">All partners</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <div className="seg" role="tablist" aria-label="Mode">
          {MODES.map(([k, label]) => (
            <button key={k || 'all'} type="button" className={mode === k ? 'on' : ''} onClick={() => { setMode(k); setPage(1); }}>{label}</button>
          ))}
        </div>
        <div className="seg" role="tablist" aria-label="Time range">
          {RANGE.map(([d, label]) => (
            <button key={d} type="button" className={days === d ? 'on' : ''} onClick={() => { setDays(d); setPage(1); }}>{label}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="t">Bids {data && <span className="count-badge">{data.total.toLocaleString('en-IN')}</span>}</span>
        </div>
        {data === null ? <Loader /> : data.rows.length === 0 ? (
          <div className="card-pad muted" style={{ textAlign: 'center', padding: '28px 0' }}>No bids in this period.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr>
                <th>Placed</th>
                {!data.scoped && <th>Partner</th>}
                <th>Order ID</th>
                <th>IPO</th>
                <th>Applicant</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Lots</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Application no.</th>
                <th>Status</th>
              </tr></thead>
              <tbody>
                {data.rows.map((r) => {
                  const [word, tone] = STATUS[r.status] ?? [r.status, 'mut'];
                  return (
                    <tr key={r.ref}>
                      <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{new Date(r.placedAt).toLocaleString('en-IN')}</td>
                      {!data.scoped && <td>{r.partner}</td>}
                      <td className="mono" style={{ fontSize: 12.5 }}>
                        {r.orderId}{r.mode === 'test' && <span className="st warn" style={{ marginLeft: 6 }}>test</span>}
                      </td>
                      <td className="mono" style={{ fontWeight: 700 }}>{r.ipoSymbol}</td>
                      <td>{r.applicant ?? '—'}</td>
                      <td>{r.category}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{r.lots}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{inr(r.amount)}</td>
                      <td className="mono" style={{ fontSize: 12.5 }}>{r.applicationNumber ?? '—'}</td>
                      <td title={r.reason ?? r.upiStatus ?? undefined}>
                        <span className={`st ${tone}`}>{word}</span>
                        {r.allotment && r.allotment.shares > 0 && <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>{r.allotment.shares} sh</span>}
                        {r.reason && <div className="muted" style={{ fontSize: 12, marginTop: 2, maxWidth: 260 }}>{r.reason}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="card-pad" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
            <span className="muted" style={{ fontSize: 13 }}>Page {page} / {pages}</span>
            <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
