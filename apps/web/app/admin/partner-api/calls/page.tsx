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

/** API Call Report — every partner-API call (success & failure). Partner logins see only their own. */
export default function PartnerApiCallsPage() {
  const me = useOperator();
  const [data, setData] = useState<api.PartnerReport<api.PartnerApiCallRow> | null>(null);
  const [tenants, setTenants] = useState<api.PartnerRow[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.fetchPartnerApiCalls({ tenantId: tenantId || undefined, days, page })
      .then((d) => { setData(d); setErr(null); })
      .catch((e) => setErr(String(e?.message ?? e)));
  }, [tenantId, days, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.fetchTenants().then(setTenants).catch(() => {}); }, []);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'reports.view')) return <NoAccess />;

  const partners = tenants;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;
  const scopedName = data?.scoped ? (me.homeTenant?.name ?? '') : '';

  return (
    <div style={{ maxWidth: 1360 }}>
      <PageHead title="Partner API — Calls" sub="Every Print-PDF API call, success and failure, with latency." />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="tbl-toolbar">
        {data?.scoped ? (
          <span className="st lock" title="You’re viewing your own organisation’s data — scope is locked to your tenant.">
            <Icon name="lock" size={12} />
            <span className="st-key">Scope:</span> {scopedName || 'your organisation'}
          </span>
        ) : (
          data && (
            <select
              className="input"
              style={{ minWidth: 220, maxWidth: 260 }}
              value={tenantId}
              onChange={(e) => { setTenantId(e.target.value); setPage(1); }}
            >
              <option value="">All partners</option>
              {partners.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )
        )}
        <div className="seg" role="tablist" aria-label="Time range">
          {RANGE.map(([d, label]) => (
            <button
              key={d}
              type="button"
              className={days === d ? 'on' : ''}
              onClick={() => { setDays(d); setPage(1); }}
            >{label}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="t">
            Partner API — Calls{' '}
            {data && <span className="count-badge">{data.total.toLocaleString('en-IN')}</span>}
          </span>
        </div>

        {data === null ? <Loader /> : data.rows.length === 0 ? (
          <div className="card-pad muted" style={{ textAlign: 'center', padding: '28px 0' }}>No API calls in this period.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr>
                <th>Time</th>
                <th>Partner</th>
                <th>Key</th>
                <th>IPO</th>
                <th style={{ textAlign: 'right' }}>Applicants</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Latency</th>
                <th>Error</th>
              </tr></thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{new Date(r.at).toLocaleString('en-IN')}</td>
                    <td>{r.partner}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.keyId}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{r.ipoSymbol ?? '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{r.applicants ?? '—'}</td>
                    <td>
                      {r.status === 'ok'
                        ? <span className="st ok">ok · {r.httpStatus}</span>
                        : <span className="st bad">error · {r.httpStatus}</span>}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>{r.durationMs != null ? `${r.durationMs} ms` : '—'}</td>
                    <td
                      style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.error ? 'var(--neg)' : undefined }}
                      title={r.error ?? ''}
                    >{r.error ?? '—'}</td>
                  </tr>
                ))}
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
