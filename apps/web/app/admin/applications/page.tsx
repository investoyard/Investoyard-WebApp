'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { PartnerBranchFilter, AppFilters } from '@/components/admin/Filters';
import { usePagination } from '@/components/ui/Pagination';
import { useSort } from '@/components/ui/useSort';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import { filterApps, distinct, appsToCsv, emptyFilter, type AppFilter } from '@/lib/appfilters';
import * as api from '@/lib/tenants-admin';

const RESULT_DONE = ['allotted', 'not_allotted', 'released', 'rejected', 'failed', 'draft'];
const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
const STATUS_CLS: Record<string, string> = { allotted: 'ok', not_allotted: 'mut', submitted: 'brand', pending: 'brand', draft: 'mut', failed: 'warn', rejected: 'warn', released: 'ok' };

function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export default function AdminApplications() {
  const me = useOperator();
  const homeSlug = me?.homeTenant.slug ?? '';
  const [tree, setTree] = useState<api.AdminTenant[]>([]);
  const [scope, setScope] = useState(homeSlug);
  const [rows, setRows] = useState<api.AdminApplication[]>([]);
  const [filter, setFilter] = useState<AppFilter>(emptyFilter());
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [csvSymbol, setCsvSymbol] = useState('');
  const [csvText, setCsvText] = useState('');
  const [csvResult, setCsvResult] = useState<api.AllotmentImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadRows = useCallback(async (slug: string) => {
    try { setRows(await api.fetchApplications(slug)); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); setRows([]); }
  }, []);

  useEffect(() => {
    (async () => {
      try { setTree(await api.fetchTree()); if (homeSlug) await loadRows(homeSlug); }
      catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setLoading(false); }
    })();
  }, [loadRows, homeSlug]);

  const onScope = async (slug: string) => { setScope(slug); await loadRows(slug); };
  const filtered = useMemo(() => filterApps(rows, filter), [rows, filter]);
  const { apply, Th } = useSort<api.AdminApplication>((a, k) => {
    switch (k) {
      case 'ipo': return a.ipoSymbol ?? '';
      case 'applicant': return (a.applicantName ?? '').toLowerCase();
      case 'channel': return a.partnerCode ?? '';
      case 'lots': return a.lots;
      case 'amount': return a.amount;
      case 'comm': return a.commissionAmount ?? 0;
      case 'status': return a.status;
      case 'applied': return a.appliedAt;
      default: return '';
    }
  });
  const { slice, node: pager } = usePagination(apply(filtered), 10);
  const ipoOpts = useMemo(() => distinct(rows, 'ipoSymbol'), [rows]);
  const statusOpts = useMemo(() => distinct(rows, 'status'), [rows]);
  const batchSize = useMemo(() => { const m: Record<string, number> = {}; rows.forEach((r) => { if (r.batchId) m[r.batchId] = (m[r.batchId] ?? 0) + 1; }); return m; }, [rows]);
  const totalAmount = useMemo(() => filtered.reduce((s, r) => s + r.amount, 0), [filtered]);

  const importCsv = async () => {
    if (!/^[A-Z0-9]{2,12}$/.test(csvSymbol) || !csvText.trim()) { setErr('Enter the IPO symbol and paste the registrar CSV.'); return; }
    setBusy(true); setErr(null); setCsvResult(null);
    try { setCsvResult(await api.importAllotments(csvSymbol, csvText)); await loadRows(scope); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const allot = async (id: string) => {
    const lots = Number(draft[id]);
    if (!Number.isInteger(lots) || lots < 0) { setErr('Enter a whole number of allotted lots.'); return; }
    setBusy(true); setErr(null);
    try { await api.recordAllotment(id, lots); await loadRows(scope); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  if (!operatorCan(me, 'bids.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'bids.manage');

  return (
    <>
      <PageHead
        title="Applications"
        sub="Every bid across your network. Filter by partner, branch, IPO, status or date."
        actions={<button className="btn btn-secondary" disabled={!filtered.length} onClick={() => downloadCsv(`investoyard-applications.csv`, appsToCsv(filtered))}>↓ Export CSV</button>}
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="filter-bar">
        <PartnerBranchFilter tree={tree} homeSlug={homeSlug} onScope={onScope} />
        <AppFilters ipos={ipoOpts} statuses={statusOpts} value={filter} onChange={setFilter} />
        <span className="fb-end"><span className="fb-count">{filtered.length} of {rows.length} · {inr(totalAmount)}</span></span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <div className="card-head"><span className="t">Applications <span className="count-badge">{rows.length}</span></span></div>
          {loading ? <Loader /> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%' }}>
                <thead><tr>
                  <Th k="ipo" label="IPO" /><Th k="applicant" label="Applicant" /><Th k="channel" label="Channel" />
                  <th>Cat.</th><Th k="lots" label="Lots" /><Th k="amount" label="Amount" /><Th k="comm" label="Comm." />
                  <Th k="status" label="Status" /><Th k="applied" label="Applied" /><th>Allotment</th><th style={{ textAlign: 'right' }}>Action</th>
                </tr></thead>
                <tbody>
                  {filtered.length === 0 ? <tr><td colSpan={11} className="muted" style={{ padding: 14 }}>No applications match.</td></tr> :
                    slice.map((a) => (
                      <tr key={a.id}>
                        <td className="mono" style={{ fontWeight: 700 }}>{a.ipoSymbol}</td>
                        <td>
                          {a.applicantName ?? '—'}
                          {a.batchId && batchSize[a.batchId] > 1 && (
                            <span className="st brand" style={{ marginLeft: 8, fontSize: 10 }} title={`Family batch of ${batchSize[a.batchId]}`}>family ×{batchSize[a.batchId]}</span>
                          )}
                          <div className="muted mono" style={{ fontSize: 11 }}>{a.mobileMasked}</div>
                        </td>
                        <td style={{ fontSize: 12 }}><span className="mono" style={{ fontWeight: 700 }}>{a.partnerCode ?? '—'}</span><div className="muted">{a.tenantName ?? a.tenantSlug}</div></td>
                        <td className="muted" style={{ textTransform: 'uppercase', fontSize: 12 }}>{a.applicantType}</td>
                        <td className="mono">{a.lots}</td>
                        <td className="mono">{inr(a.amount)}</td>
                        <td className="mono" title={a.commissionRate ? `${a.commissionRate}% of allotted` : ''}>{a.commissionAmount ? inr(a.commissionAmount) : '—'}</td>
                        <td><span className={`st ${STATUS_CLS[a.status] ?? 'mut'}`}>{a.status.replace(/_/g, ' ')}</span></td>
                        <td className="mono muted" style={{ fontSize: 12 }}>{a.appliedAt}</td>
                        <td>
                          {a.allottedLots != null ? (
                            <span className="mono" title={a.allotmentReason ?? ''}>{a.allottedLots > 0 ? `${a.allottedLots} lot(s)` : 'none'}{a.refundAmount ? ` · ${inr(a.refundAmount)} refund` : ''}</span>
                          ) : canManage && !RESULT_DONE.includes(a.status) ? (
                            <span className="row" style={{ gap: 6 }}>
                              <input className="input mono" style={{ width: 56, padding: '4px 6px' }} placeholder="lots" value={draft[a.id] ?? ''}
                                onChange={(e) => setDraft({ ...draft, [a.id]: e.target.value.replace(/\D/g, '') })} />
                              <button className="btn btn-sm" disabled={busy} onClick={() => allot(a.id)}>Record</button>
                            </span>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td>
                          <span className="row-actions">
                            <a className="icon-btn" href={`/admin/applications/view?id=${a.id}`} title="View details"><Icon name="eye" size={15} /></a>
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && pager}
        </div>

        {canManage && (
          <div className="card"><div className="card-pad">
            <div className="fs-head" style={{ marginBottom: 12 }}><div className="t">Import allotment (registrar CSV)</div>
              <div className="d">One <span className="mono">PAN,allottedLots</span> per line (0 = not allotted). Matched by PAN across all channels; refunds &amp; notifications are automatic.</div>
            </div>
            <div className="row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <input className="input mono" style={{ width: 120 }} placeholder="SYMBOL" value={csvSymbol}
                onChange={(e) => setCsvSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))} />
              <textarea className="input mono" style={{ flex: '1 1 280px', minHeight: 90, fontSize: 12 }}
                placeholder={'PAN,allottedLots\nABCDE1234F,1\nFGHIJ5678K,0'} value={csvText} onChange={(e) => setCsvText(e.target.value)} />
              <button className="btn" disabled={busy} onClick={importCsv}>Import</button>
            </div>
            {csvResult && (
              <div className="banner info" style={{ marginTop: 12, fontSize: 13 }}>
                <b>{csvResult.ipo}</b>: {csvResult.updated} of {csvResult.lines} line(s) recorded.
                {csvResult.notFound.length > 0 && <> No match: {csvResult.notFound.join('; ')}.</>}
                {csvResult.errors.length > 0 && <> Errors: {csvResult.errors.join('; ')}.</>}
              </div>
            )}
          </div></div>
        )}
      </div>
    </>
  );
}
