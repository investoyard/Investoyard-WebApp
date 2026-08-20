'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { SearchSelect } from '@/components/ui/SearchSelect';
import * as api from '@/lib/tenants-admin';

const fmtInt = (n: number) => n.toLocaleString('en-IN');
const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * Allotment List — browse the imported registrar records per IPO.
 * Search by PAN (partial, e.g. first 5 chars) and by amount with a > / < / =
 * operator (applied or allotted amount), plus an allotted / not-allotted filter.
 */
export default function AllotmentListPage() {
  const me = useOperator();
  const [ipos, setIpos] = useState<api.AdminIpo[] | null>(null);
  const [ipoId, setIpoId] = useState('');
  const [summary, setSummary] = useState<api.AllotmentSummary | null>(null);
  // search inputs (applied on Search click)
  const [pan, setPan] = useState('');
  const [amountField, setAmountField] = useState<'applied' | 'allotted'>('applied');
  const [amountOp, setAmountOp] = useState<'>' | '<' | '='>('=');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ total: number; page: number; pageSize: number; rows: api.AllotmentRecordRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.fetchIpos().then((list) => {
      const sorted = [...list].sort((a, b) => (b.openDate ?? '').localeCompare(a.openDate ?? ''));
      setIpos(sorted);
      if (sorted.length) setIpoId((cur) => cur || sorted[0].id);
    }).catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  const search = useCallback(async (id: string, toPage = 1) => {
    if (!id) return;
    setBusy(true); setErr(null);
    try {
      const [res, sum] = await Promise.all([
        api.searchAllotmentRecords({
          ipoId: id,
          pan: pan.trim() || undefined,
          amount: amount.trim() === '' ? undefined : Number(amount),
          amountOp, amountField, status: status || undefined, page: toPage,
        }),
        api.fetchAllotmentSummary(id),
      ]);
      setResult(res); setSummary(sum); setPage(toPage);
    } catch (e: any) { setErr(String(e?.message ?? e)); setResult(null); }
    finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pan, amount, amountOp, amountField, status]);

  // fresh IPO selection → clear filters and load page 1
  useEffect(() => { if (ipoId) { setResult(null); search(ipoId, 1); } // eslint-disable-line react-hooks/exhaustive-deps
  }, [ipoId]);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'bids.view')) return <NoAccess />;

  const reset = () => { setPan(''); setAmount(''); setAmountOp('='); setAmountField('applied'); setStatus(''); };
  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div style={{ maxWidth: 1200 }}>
      <PageHead
        title="Allotment List"
        sub="Search the imported registrar records — by PAN (partial works) and by amount with a greater / less / equal operator."
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}

      {/* filters */}
      <div className="card"><div className="card-pad">
        <div className="filter-row">
          <div className="field" style={{ minWidth: 240, flex: '1 1 240px' }}>
            <label>IPO</label>
            <SearchSelect
              options={(ipos ?? []).map((i) => ({ value: i.id, label: `${i.symbol} — ${i.name}` }))}
              value={ipoId} onChange={setIpoId} disabled={ipos === null} placeholder="Search IPO…"
            />
          </div>
          <div className="field" style={{ width: 170 }}>
            <label>PAN</label>
            <input className="input mono" value={pan} maxLength={10} placeholder="AIOPC8724F"
              onChange={(e) => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') search(ipoId, 1); }} />
          </div>
          <div className="field" style={{ width: 130 }}>
            <label>Amount of</label>
            <select className="input" value={amountField} onChange={(e) => setAmountField(e.target.value as any)}>
              <option value="applied">Applied ₹</option>
              <option value="allotted">Allotted ₹</option>
            </select>
          </div>
          <div className="field" style={{ width: 64 }}>
            <label>Op</label>
            <select className="input" value={amountOp} onChange={(e) => setAmountOp(e.target.value as any)}>
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value="=">=</option>
            </select>
          </div>
          <div className="field" style={{ width: 140 }}>
            <label>Amount (₹)</label>
            <input className="input mono" type="number" min={0} value={amount} placeholder="14875"
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') search(ipoId, 1); }} />
          </div>
          <div className="field" style={{ width: 150 }}>
            <label>Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="allotted">Allotted</option>
              <option value="not_allotted">Not allotted</option>
            </select>
          </div>
          <button className="btn" disabled={busy || !ipoId} onClick={() => search(ipoId, 1)}>{busy ? 'Searching…' : 'Search'}</button>
          <button className="btn btn-ghost" disabled={busy} onClick={reset}>Reset</button>
        </div>

        {summary && (
          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span className="pill">{fmtInt(summary.total)} records</span>
            <span className="pill" style={{ background: 'var(--pos-soft)', color: 'var(--pos)' }}>{fmtInt(summary.allotted)} allotted</span>
            <span className="pill">{fmtInt(summary.notAllotted)} not allotted</span>
            {summary.total === 0 && summary.archive && (
              <span className="muted" style={{ fontSize: 13 }}>
                Data is archived ({fmtInt(summary.archive.rows)} rows) — restore it from the Import Allotment page to search.
              </span>
            )}
          </div>
        )}
      </div></div>

      {/* results */}
      <div className="card" style={{ marginTop: 14 }}><div className="card-pad">
        {result === null ? (busy ? <Loader /> : <div className="muted" style={{ padding: '14px 0', textAlign: 'center' }}>Pick an IPO to load records.</div>)
        : result.rows.length === 0 ? (
          <div className="muted" style={{ padding: '14px 0', textAlign: 'center' }}>No records match this search.</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr>
                  <th>PAN</th><th>Name</th><th>Application No</th><th>Catg</th>
                  <th style={{ textAlign: 'right' }}>Applied</th><th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'right' }}>Allotted</th><th style={{ textAlign: 'right' }}>Allotted ₹</th>
                  <th style={{ textAlign: 'right' }}>Refund ₹</th><th>Reason</th>
                </tr></thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.pan || '—'}</td>
                      <td><div style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name ?? ''}>{r.name || '—'}</div></td>
                      <td className="mono">{r.applicationNo || '—'}</td>
                      <td className="mono">{r.category || '—'}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmtInt(r.appliedShares)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(r.amount)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        {r.allottedShares > 0
                          ? <span style={{ color: 'var(--pos)', fontWeight: 600 }}>{fmtInt(r.allottedShares)}</span>
                          : <span style={{ color: 'var(--neg)' }}>0</span>}
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>{r.allottedAmount ? money(r.allottedAmount) : '—'}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{r.refundAmount ? money(r.refundAmount) : '—'}</td>
                      <td><div style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason ?? ''}>{r.reason || '—'}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ gap: 10, marginTop: 12, alignItems: 'center', justifyContent: 'flex-end' }}>
              <span className="muted" style={{ fontSize: 13 }}>
                {fmtInt(result.total)} matches · page {result.page} of {fmtInt(pages)}
              </span>
              <button className="btn btn-secondary btn-sm" disabled={busy || page <= 1} onClick={() => search(ipoId, page - 1)}>‹ Prev</button>
              <button className="btn btn-secondary btn-sm" disabled={busy || page >= pages} onClick={() => search(ipoId, page + 1)}>Next ›</button>
            </div>
          </>
        )}
      </div></div>
    </div>
  );
}
