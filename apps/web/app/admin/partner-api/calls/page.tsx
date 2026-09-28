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

/** The list, then the four groupings the operator asked for (2026-09-28). */
type Tab = 'log' | api.CallsSummaryBy;
const TABS: [Tab, string][] = [['log', 'Calls'], ['partner', 'By partner'], ['day', 'By day'], ['month', 'By month'], ['ipo', 'By IPO']];

/** API Call Report — every partner-API call (success & failure). Partner logins see only their own. */
export default function PartnerApiCallsPage() {
  const me = useOperator();
  const [data, setData] = useState<api.PartnerReport<api.PartnerApiCallRow> | null>(null);
  const [sum, setSum] = useState<api.PartnerCallsSummary | null>(null);
  const [tenants, setTenants] = useState<api.PartnerRow[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<Tab>('log');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.fetchPartnerApiCalls({ tenantId: tenantId || undefined, days, page })
      .then((d) => { setData(d); setErr(null); })
      .catch((e) => setErr(String(e?.message ?? e)));
  }, [tenantId, days, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.fetchTenants().then(setTenants).catch(() => {}); }, []);

  /* The summary is only fetched for the tab being looked at — four groupings
     of the same window, and nobody reads all four at once. */
  useEffect(() => {
    if (tab === 'log') return;
    setSum(null);
    api.fetchPartnerApiCallsSummary({ tenantId: tenantId || undefined, days, by: tab })
      .then((d) => { setSum(d); setErr(null); })
      .catch((e) => setErr(String(e?.message ?? e)));
  }, [tab, tenantId, days]);

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

      {/* Tabs sit OUTSIDE the card, on the toolbar line, matching the range
          control above — the card head then names whichever view is open.
          The Partner tab is hidden for a partner login: `scoped` means every
          row is theirs, so the grouping would be a single row restating the
          total already in the head. */}
      <div className="seg" role="tablist" aria-label="View" style={{ marginBottom: 14 }}>
        {TABS.filter(([k]) => !(k === 'partner' && data?.scoped)).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k}
            className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab !== 'log' && <SummaryCard sum={sum} tenantId={tenantId} days={days} />}

      {tab === 'log' && (
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
      )}
    </div>
  );
}

const HEAD: Record<api.CallsSummaryBy, string> = {
  partner: 'Partner', day: 'Date', month: 'Month', ipo: 'IPO',
};

/** One grouping of the call log. Same shape whichever dimension is chosen. */
function SummaryCard({ sum, tenantId, days }: { sum: api.PartnerCallsSummary | null; tenantId: string; days: number }) {
  if (sum === null) return <div className="card"><Loader /></div>;
  const totals = sum.rows.reduce((a, r) => ({
    calls: a.calls + r.calls, failed: a.failed + r.failed, applicants: a.applicants + r.applicants,
  }), { calls: 0, failed: 0, applicants: 0 });
  const pctOf = (f: number, c: number) => (c > 0 ? (f / c) * 100 : 0);

  return (
    <div className="card">
      <div className="card-head">
        <span className="t">
          {HEAD[sum.by]} summary <span className="count-badge">{sum.rows.length.toLocaleString('en-IN')}</span>
        </span>
        {sum.rows.length > 0 && (
          <button className="btn btn-secondary btn-sm"
            onClick={() => api.exportPartnerApiCallsSummaryCsv({ tenantId: tenantId || undefined, days, by: sum.by })}>
            <Icon name="download" size={14} /> CSV
          </button>
        )}
      </div>
      {sum.rows.length === 0 ? (
        <div className="card-pad muted" style={{ textAlign: 'center', padding: '28px 0' }}>No API calls in this period.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr>
              <th>{HEAD[sum.by]}</th>
              {sum.by === 'ipo' && <th>Name</th>}
              <th style={{ textAlign: 'right' }}>Calls</th>
              <th style={{ textAlign: 'right' }}>Failed</th>
              <th style={{ textAlign: 'right' }}>Failed %</th>
              <th style={{ textAlign: 'right' }}>Applicants</th>
              <th style={{ textAlign: 'right' }}>Avg latency</th>
              <th>Last call</th>
            </tr></thead>
            <tbody>
              {sum.rows.map((r) => {
                const pct = pctOf(r.failed, r.calls);
                return (
                  <tr key={r.key}>
                    <td className="mono" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{r.key}</td>
                    {sum.by === 'ipo' && (
                      /* No name means the symbol is not in the catalogue —
                         which IS the diagnosis for every failure on that row. */
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={r.label ?? 'This symbol is not in the catalogue'}>
                        {r.label ?? <span className="st bad">not in catalogue</span>}
                      </td>
                    )}
                    <td className="mono" style={{ textAlign: 'right' }}>{r.calls.toLocaleString('en-IN')}</td>
                    <td className="mono" style={{ textAlign: 'right', color: r.failed > 0 ? 'var(--neg)' : undefined }}>
                      {r.failed.toLocaleString('en-IN')}
                    </td>
                    {/* Every call failing is a different problem from a few
                        failing, and the rate is what separates them at a glance. */}
                    <td style={{ textAlign: 'right' }}>
                      {r.failed === 0
                        ? <span className="muted mono">0%</span>
                        : <span className={`st ${pct >= 100 ? 'bad' : 'warn'}`}>{pct.toFixed(pct >= 10 ? 0 : 1)}%</span>}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>{r.applicants.toLocaleString('en-IN')}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{r.avgMs} ms</td>
                    <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {r.lastAt ? new Date(r.lastAt).toLocaleString('en-IN') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="resv-total">
              <td style={{ fontWeight: 700 }}>Total</td>
              {sum.by === 'ipo' && <td />}
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{totals.calls.toLocaleString('en-IN')}</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: totals.failed > 0 ? 'var(--neg)' : undefined }}>
                {totals.failed.toLocaleString('en-IN')}
              </td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{pctOf(totals.failed, totals.calls).toFixed(1)}%</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{totals.applicants.toLocaleString('en-IN')}</td>
              <td /><td />
            </tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
