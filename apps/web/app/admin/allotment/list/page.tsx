'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { SearchSelect } from '@/components/ui/SearchSelect';
import * as api from '@/lib/tenants-admin';

const fmtInt = (n: number) => n.toLocaleString('en-IN');
const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** The registrar's own column names for one application — confirmed verbatim
 *  against the header row stored on AllotmentImport.headers. */
const PER_RECORD = ['APPLICATION_NO', 'BID_CATG', 'SHARES_APPLIED', 'AMOUNT_PAID', 'SHARES_ALLOTED', 'APPLN_STATUS', 'REASON_FOR_REJECTION'] as const;

/**
 * THE PIVOT IS PAGED ON SCREEN WHILE THE CSV CARRIES EVERYTHING, and that is
 * not polish. The table is as wide as the widest PAN in the result — one PAN in
 * the data holds 18 records, so 127 columns — and 5,000 rows of that is 635,000
 * cells, which no browser renders. 50 rows is 6,350.
 */
const BULK_PAGE = 50;

const statusInk = (s: api.PanStatus) =>
  s === 'ALLOTTED' ? 'var(--pos-ink)' : s === 'REJECTED' ? 'var(--neg-ink)' : 'var(--text-muted)';

/**
 * Allotment List — browse the imported registrar records per IPO.
 *
 * TWO MODES. *Single* is the original: partial PAN plus an amount with a
 * > / < / = operator. *Bulk PAN* takes a pasted column of whole PANs and
 * returns ONE LINE PER PAN, each of its applications contributing a block of
 * the registrar's own seven columns, ordered allotted → not allotted →
 * rejected. Only the open mode fetches.
 */
export default function AllotmentListPage() {
  const me = useOperator();
  const [ipos, setIpos] = useState<api.AdminIpo[] | null>(null);
  const [ipoId, setIpoId] = useState('');
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [summary, setSummary] = useState<api.AllotmentSummary | null>(null);
  // search inputs (applied on Search click)
  const [pan, setPan] = useState('');
  const [amountField, setAmountField] = useState<'applied' | 'allotted'>('applied');
  const [amountOp, setAmountOp] = useState<'>' | '<' | '='>('=');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ total: number; page: number; pageSize: number; rows: api.AllotmentRecordRow[] } | null>(null);
  // bulk mode
  const [panText, setPanText] = useState('');
  const [bulk, setBulk] = useState<api.PanSummary | null>(null);
  const [bulkPage, setBulkPage] = useState(1);
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
  useEffect(() => {
    if (!ipoId) return;
    setResult(null); setBulk(null);
    if (mode === 'single') search(ipoId, 1);
    else api.fetchAllotmentSummary(ipoId).then(setSummary).catch(() => setSummary(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipoId, mode]);

  /* Counted from the same separators the server splits on, so the number under
     the box is what will actually be looked up. */
  const pastedCount = useMemo(
    () => new Set(panText.split(/[\s,;]+/).filter(Boolean).map((p) => p.toUpperCase())).size,
    [panText],
  );

  const runBulk = useCallback(async () => {
    if (!ipoId || !panText.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await api.panSummary(ipoId, panText);
      setBulk(res); setBulkPage(1);
    } catch (e: any) { setErr(String(e?.message ?? e)); setBulk(null); }
    finally { setBusy(false); }
  }, [ipoId, panText]);

  const exportBulk = useCallback(async () => {
    if (!ipoId || !bulk) return;
    setBusy(true); setErr(null);
    try { await api.exportPanSummaryCsv(ipoId, panText, bulk.symbol); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }, [ipoId, panText, bulk]);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'bids.view')) return <NoAccess />;

  const reset = () => { setPan(''); setAmount(''); setAmountOp('='); setAmountField('applied'); setStatus(''); };
  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const bulkPages = bulk ? Math.max(1, Math.ceil(bulk.rows.length / BULK_PAGE)) : 1;
  const bulkSlice = bulk ? bulk.rows.slice((bulkPage - 1) * BULK_PAGE, bulkPage * BULK_PAGE) : [];
  const width = bulk ? Math.max(1, bulk.maxRecords) : 1;

  return (
    <div style={{ maxWidth: 1200 }}>
      <PageHead
        title="Allotment List"
        sub="Search the imported registrar records — one PAN at a time with an amount filter, or paste a whole column of PANs for a line each."
      />
      {err && <div className="banner bad" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="card"><div className="card-pad">
        {/* mode */}
        <div className="seg" role="tablist" aria-label="Search mode" style={{ marginBottom: 12 }}>
          <button className={mode === 'single' ? 'on' : ''} onClick={() => setMode('single')}>Single PAN</button>
          <button className={mode === 'bulk' ? 'on' : ''} onClick={() => setMode('bulk')}>Bulk PAN</button>
        </div>

        <div className="filter-row">
          <div className="field" style={{ minWidth: 240, flex: '1 1 240px' }}>
            <label>IPO</label>
            <SearchSelect
              options={(ipos ?? []).map((i) => ({ value: i.id, label: `${i.symbol} — ${i.name}` }))}
              value={ipoId} onChange={setIpoId} disabled={ipos === null || busy} placeholder="Search IPO…"
            />
          </div>

          {mode === 'single' ? (
            <>
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
              {/* A LINK, not a fetch: the export streams and a large IPO runs to
                  hundreds of MB, which must never be held in a browser variable.
                  It carries the same filters the table is showing, so what you get
                  is what you are looking at — including a filtered subset. */}
              <a
                className="btn btn-ghost"
                href={ipoId ? api.allotmentCsvUrl({ ipoId, pan, amountOp, amount, amountField, status }) : undefined}
                aria-disabled={!ipoId || !result}
                style={!ipoId || !result ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
                title="Download the rows matching these filters as a CSV, which Excel opens directly"
              >Export to Excel</a>
            </>
          ) : (
            <>
              <button className="btn" disabled={busy || !ipoId || !pastedCount} onClick={runBulk}>
                {busy ? 'Searching…' : `Search ${pastedCount ? fmtInt(pastedCount) + ' PAN' + (pastedCount === 1 ? '' : 's') : ''}`}
              </button>
              <button className="btn btn-ghost" disabled={busy || !panText} onClick={() => { setPanText(''); setBulk(null); }}>Clear</button>
              {/* A fetch rather than a link, because the PAN list is the request
                  BODY — 5,000 PANs do not belong in a URL. */}
              <button className="btn btn-ghost" disabled={busy || !bulk} onClick={exportBulk}
                title="Download this pivot as a CSV, which Excel opens directly">Export to Excel</button>
            </>
          )}
        </div>

        {mode === 'bulk' && (
          <div className="field" style={{ marginTop: 4 }}>
            <label>PANs — paste a column from Excel; newlines, commas, spaces and tabs all work</label>
            <textarea className="input mono" rows={5} value={panText} placeholder={'AIOPC8724F\nBDCPN1903K\nACMPP9252H'}
              onChange={(e) => setPanText(e.target.value)} disabled={busy}
              style={{ resize: 'vertical', lineHeight: 1.5 }} />
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              {fmtInt(pastedCount)} PAN{pastedCount === 1 ? '' : 's'} detected
              {pastedCount > api.PAN_SUMMARY_MAX && (
                <span style={{ color: 'var(--neg-ink)' }}> — over the {fmtInt(api.PAN_SUMMARY_MAX)} limit, split the list</span>
              )}
              {' · '}one line per PAN, each application shown separately, ordered allotted then not allotted then rejected
            </div>
          </div>
        )}

        {summary && (
          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span className="pill">{fmtInt(summary.total)} records</span>
            <span className="pill" style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}>{fmtInt(summary.allotted)} allotted</span>
            <span className="pill">{fmtInt(summary.notAllotted)} not allotted</span>
            {summary.total === 0 && summary.archive && (
              <span className="muted" style={{ fontSize: 13 }}>
                Data is archived ({fmtInt(summary.archive.rows)} rows) — restore it from the Import Allotment page to search.
              </span>
            )}
          </div>
        )}
      </div></div>

      {/* ── bulk results ───────────────────────────────────────────────── */}
      {mode === 'bulk' && (
        <div className="card" style={{ marginTop: 14 }}><div className="card-pad">
          {bulk === null ? (busy ? <Loader /> : (
            <div className="muted" style={{ padding: '14px 0', textAlign: 'center' }}>Paste PANs above and press Search.</div>
          )) : (
            <>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                <b>{bulk.symbol}</b>
                <span className="pill">{fmtInt(bulk.rows.length)} found</span>
                {bulk.notFound.length > 0 && <span className="pill">{fmtInt(bulk.notFound.length)} not in this file</span>}
                {bulk.invalid.length > 0 && (
                  <span className="pill" style={{ background: 'var(--neg-soft)', color: 'var(--neg-ink)' }}>{fmtInt(bulk.invalid.length)} not a PAN</span>
                )}
                {bulk.maxRecords > 1 && (
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    widest PAN holds {bulk.maxRecords} applications, so each row has {bulk.maxRecords} blocks of columns
                  </span>
                )}
              </div>

              {bulk.rows.length === 0 ? (
                <div className="muted" style={{ padding: '14px 0', textAlign: 'center' }}>None of those PANs appears in this IPO&rsquo;s registrar data.</div>
              ) : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>PAN</th>
                          {Array.from({ length: width }, (_, i) => (
                            <th key={i} colSpan={PER_RECORD.length} style={{ textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                              {width === 1 ? 'Application' : `Application ${i + 1}`}
                            </th>
                          ))}
                        </tr>
                        <tr>
                          {Array.from({ length: width }, (_, i) => PER_RECORD.map((c, j) => (
                            <th key={`${i}-${c}`} className="mono" style={{ fontSize: 10.5, whiteSpace: 'nowrap', borderLeft: j === 0 ? '1px solid var(--border)' : undefined }}>
                              {c}
                            </th>
                          )))}
                        </tr>
                      </thead>
                      <tbody>
                        {bulkSlice.map((row) => (
                          <tr key={row.pan}>
                            <td className="mono" style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{row.pan}</td>
                            {Array.from({ length: width }, (_, i) => {
                              const r = row.records[i];
                              const bl = { borderLeft: '1px solid var(--border)' } as const;
                              if (!r) return PER_RECORD.map((c, j) => <td key={`${i}-${c}`} style={j === 0 ? bl : undefined} />);
                              return [
                                <td key={`${i}-a`} className="mono" style={{ ...bl, whiteSpace: 'nowrap' }}>{r.applicationNo || '—'}</td>,
                                <td key={`${i}-b`} className="mono">{r.bidCatg || '—'}</td>,
                                <td key={`${i}-c`} className="mono" style={{ textAlign: 'right' }}>{fmtInt(r.sharesApplied)}</td>,
                                <td key={`${i}-d`} className="mono" style={{ textAlign: 'right' }}>{money(r.amountPaid)}</td>,
                                <td key={`${i}-e`} className="mono" style={{ textAlign: 'right' }}>
                                  {r.sharesAllotted > 0
                                    ? <span style={{ color: 'var(--pos-ink)', fontWeight: 600 }}>{fmtInt(r.sharesAllotted)}</span>
                                    : 0}
                                </td>,
                                <td key={`${i}-f`} style={{ whiteSpace: 'nowrap', color: statusInk(r.applnStatus), fontWeight: 600, fontSize: 11.5 }}>{r.applnStatus}</td>,
                                <td key={`${i}-g`}>
                                  <div style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reasonForRejection ?? ''}>
                                    {r.reasonForRejection || '—'}
                                  </div>
                                </td>,
                              ];
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {bulkPages > 1 && (
                    <div className="row" style={{ gap: 10, marginTop: 12, alignItems: 'center', justifyContent: 'flex-end' }}>
                      <span className="muted" style={{ fontSize: 13 }}>
                        page {bulkPage} of {fmtInt(bulkPages)} · the Excel export carries all {fmtInt(bulk.rows.length)} rows
                      </span>
                      <button className="btn btn-secondary btn-sm" disabled={bulkPage <= 1} onClick={() => setBulkPage(bulkPage - 1)}>‹ Prev</button>
                      <button className="btn btn-secondary btn-sm" disabled={bulkPage >= bulkPages} onClick={() => setBulkPage(bulkPage + 1)}>Next ›</button>
                    </div>
                  )}
                </>
              )}

              {/* Reported, never silently dropped: a typo in a pasted column is
                  the likeliest reason a PAN "is not in the file". */}
              {bulk.notFound.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Not in this IPO&rsquo;s registrar data ({fmtInt(bulk.notFound.length)})</div>
                  <div className="muted mono" style={{ fontSize: 12, wordBreak: 'break-all', lineHeight: 1.7 }}>{bulk.notFound.join(' · ')}</div>
                </div>
              )}
              {bulk.invalid.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: 'var(--neg-ink)' }}>Not a valid PAN ({fmtInt(bulk.invalid.length)})</div>
                  <div className="muted mono" style={{ fontSize: 12, wordBreak: 'break-all', lineHeight: 1.7 }}>{bulk.invalid.join(' · ')}</div>
                </div>
              )}
            </>
          )}
        </div></div>
      )}

      {/* ── single-PAN results (unchanged) ─────────────────────────────── */}
      {mode === 'single' && (
        <div className="card" style={{ marginTop: 14 }}><div className="card-pad">
          {result === null ? (busy ? <Loader /> : <div className="muted" style={{ padding: '14px 0', textAlign: 'center' }}>Pick an IPO to load records.</div>)
          : result.rows.length === 0 ? (
            <div className="muted" style={{ padding: '14px 0', textAlign: 'center' }}>No records match this search.</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr>
                    <th>PAN</th><th>Name</th><th>Application No</th><th>Catg</th><th>TM Name</th>
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
                        {/* Null on every row imported before 2026-10-13, and on
                            any file whose registrar does not ship the column —
                            a dash says "not in this data", never a wrong name. */}
                        <td><div style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.tmName ?? ''}>{r.tmName || '—'}</div></td>
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
      )}
    </div>
  );
}
