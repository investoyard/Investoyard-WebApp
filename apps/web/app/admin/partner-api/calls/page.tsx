'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import * as api from '@/lib/tenants-admin';

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

  return (
    <div style={{ maxWidth: 1360 }}>
      <PageHead title="Partner API — Calls" sub="Every Print-PDF API call, success and failure, with latency." />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="row" style={{ gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {data && !data.scoped && (
          <select className="input" style={{ maxWidth: 260 }} value={tenantId} onChange={(e) => { setTenantId(e.target.value); setPage(1); }}>
            <option value="">All partners</option>
            {partners.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <select className="input" style={{ maxWidth: 160 }} value={days} onChange={(e) => { setDays(Number(e.target.value)); setPage(1); }}>
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>

      {data === null ? <Loader /> : (
        <div className="card"><div className="card-pad">
          {data.rows.length === 0 ? (
            <div className="muted" style={{ padding: '18px 0', textAlign: 'center' }}>No API calls in this period.</div>
          ) : (
            <table className="table">
              <thead><tr><th>Time</th><th>Partner</th><th>Key</th><th>IPO</th><th>Applicants</th><th>Status</th><th>Time (ms)</th><th>Error</th></tr></thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString('en-IN')}</td>
                    <td>{r.partner}</td>
                    <td className="mono">{r.keyId}</td>
                    <td className="mono">{r.ipoSymbol ?? '—'}</td>
                    <td>{r.applicants ?? '—'}</td>
                    <td>
                      {r.status === 'ok'
                        ? <span className="pill" style={{ background: 'var(--pos-soft)', color: 'var(--pos)' }}>ok · {r.httpStatus}</span>
                        : <span className="pill" style={{ background: 'var(--neg-soft)', color: 'var(--neg)' }}>error · {r.httpStatus}</span>}
                    </td>
                    <td className="mono">{r.durationMs ?? '—'}</td>
                    <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.error ?? ''}>{r.error ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {pages > 1 && (
            <div className="row" style={{ gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
              <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>Page {page} / {pages}</span>
              <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
          )}
        </div></div>
      )}
    </div>
  );
}
