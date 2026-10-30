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
 * TWO CONTROLS: what to search by (PAN / Application No / Application
 * range), and whether it is one value or a pasted column. Only the open
 * combination fetches.
 *
 *  - PAN, single: the original — partial PAN plus an amount with a
 *    > / < / = operator.
 *  - PAN, bulk: a pasted column of whole PANs, ONE LINE PER PAN, each of its
 *    applications contributing a block of the registrar's own seven columns,
 *    ordered allotted → not allotted → rejected.
 *  - Application No: exact, starts-with or contains. FLAT in bulk, because an
 *    application number is unique per IPO so there is nothing to pivot.
 *  - Application range: a start and an end of the SAME WIDTH, read and
 *    exported in series order, with a found-count against the span.
 *
 * Application numbers are never uppercased, unlike PAN — see `api.cleanAppNo`
 * and the note on `recordWhere`.
 */
export default function AllotmentListPage() {
  const me = useOperator();
  const [ipos, setIpos] = useState<api.AdminIpo[] | null>(null);
  const [ipoId, setIpoId] = useState('');
  /**
   * WHAT is being searched, and HOW. Two controls rather than four chips in a
   * row: the second question only applies to the first two answers.
   *
   * `range` has no bulk form — it IS a range, not a list — so `bulkable` gates
   * the Single/Bulk control rather than letting it offer a combination that
   * does not exist.
   */
  const [field, setField] = useState<'pan' | 'appno' | 'range'>('pan');
  const [isBulk, setIsBulk] = useState(false);
  const [summary, setSummary] = useState<api.AllotmentSummary | null>(null);
  // search inputs (applied on Search click)
  const [pan, setPan] = useState('');
  const [amountField, setAmountField] = useState<'applied' | 'allotted'>('applied');
  const [amountOp, setAmountOp] = useState<'>' | '<' | '='>('=');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{
    total: number; page: number; pageSize: number; rangeSpan: number | null; rows: api.AllotmentRecordRow[];
  } | null>(null);
  // application-number search (single) and range
  const [appNo, setAppNo] = useState('');
  const [appNoMode, setAppNoMode] = useState<api.AppNoMode>('exact');
  const [appFrom, setAppFrom] = useState('');
  const [appTo, setAppTo] = useState('');
  // application-number search (bulk)
  const [appNoText, setAppNoText] = useState('');
  const [appBulk, setAppBulk] = useState<api.AppNoSummary | null>(null);
  const [appBulkPage, setAppBulkPage] = useState(1);
  // bulk mode
  const [panText, setPanText] = useState('');
  const [bulk, setBulk] = useState<api.PanSummary | null>(null);
  const [bulkPage, setBulkPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* A range has no bulk form, so the Single/Bulk control is hidden for it
     rather than offering a combination that does not exist. */
  const bulkable = field !== 'range';
  const panBulk = isBulk && field === 'pan';
  const appBulkOn = isBulk && field === 'appno';
  const tableView = !panBulk && !appBulkOn;

  useEffect(() => {
    api.fetchIpos().then((list) => {
      const sorted = [...list].sort((a, b) => (b.openDate ?? '').localeCompare(a.openDate ?? ''));
      setIpos(sorted);
      if (sorted.length) setIpoId((cur) => cur || sorted[0].id);
    }).catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  /**
   * The filters the table and the Export link both carry — ONE object, so the
   * file is the rows on screen rather than a second reading of the controls.
   *
   * Only the chosen field's values go in: leaving a stale application number in
   * the query while the operator is searching by PAN would filter by something
   * no longer on the screen.
   */
  const query = useMemo((): api.AllotmentRecordQuery => ({
    ipoId,
    pan: field === 'pan' ? (pan.trim() || undefined) : undefined,
    appNo: field === 'appno' ? (appNo.trim() || undefined) : undefined,
    appNoMode: field === 'appno' ? appNoMode : undefined,
    appFrom: field === 'range' ? (appFrom.trim() || undefined) : undefined,
    appTo: field === 'range' ? (appTo.trim() || undefined) : undefined,
    amount: amount.trim() === '' ? undefined : Number(amount),
    amountOp, amountField, status: status || undefined,
  }), [ipoId, field, pan, appNo, appNoMode, appFrom, appTo, amount, amountOp, amountField, status]);

  /* The range rule, from the shared module the API enforces — so the screen
     cannot explain a rule the server does not apply. Shown before the request
     rather than after, since the server would refuse it anyway. */
  const rangeErr = useMemo(
    () => (field === 'range' && (appFrom.trim() || appTo.trim()) ? api.rangeProblem(appFrom, appTo) : null),
    [field, appFrom, appTo],
  );

  const search = useCallback(async (id: string, toPage = 1) => {
    if (!id) return;
    setBusy(true); setErr(null);
    try {
      const [res, sum] = await Promise.all([
        api.searchAllotmentRecords({ ...query, ipoId: id, page: toPage }),
        api.fetchAllotmentSummary(id),
      ]);
      setResult(res); setSummary(sum); setPage(toPage);
    } catch (e: any) { setErr(String(e?.message ?? e)); setResult(null); }
    finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // fresh IPO selection → clear filters and load page 1
  useEffect(() => {
    if (!ipoId) return;
    setResult(null); setBulk(null); setAppBulk(null);
    if (tableView) search(ipoId, 1);
    else api.fetchAllotmentSummary(ipoId).then(setSummary).catch(() => setSummary(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipoId, field, isBulk]);

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

  /* Counted from the same separators the server splits on, so the number under
     the box is what will actually be looked up. Case is NOT folded here — two
     application numbers differing only in case are two different numbers. */
  const appPastedCount = useMemo(
    () => new Set(appNoText.split(/[\s,;]+/).filter(Boolean)).size,
    [appNoText],
  );
  /* The cap depends on the mode, and the gap is three orders of magnitude:
     contains cannot use the index, so it is one full scan plus a third of a
     second per extra number. */
  const appCap = api.appNoBulkMax(appNoMode);
  const appOverCap = appPastedCount > appCap;

  const runAppBulk = useCallback(async () => {
    if (!ipoId || !appNoText.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await api.appNoSummary(ipoId, appNoText, appNoMode);
      setAppBulk(res); setAppBulkPage(1);
    } catch (e: any) { setErr(String(e?.message ?? e)); setAppBulk(null); }
    finally { setBusy(false); }
  }, [ipoId, appNoText, appNoMode]);

  const exportAppBulk = useCallback(async () => {
    if (!ipoId || !appBulk) return;
    setBusy(true); setErr(null);
    try { await api.exportAppNoSummaryCsv(ipoId, appNoText, appNoMode, appBulk.symbol); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }, [ipoId, appNoText, appNoMode, appBulk]);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'bids.view')) return <NoAccess />;

  const reset = () => {
    setPan(''); setAppNo(''); setAppFrom(''); setAppTo('');
    setAmount(''); setAmountOp('='); setAmountField('applied'); setStatus('');
  };
  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const bulkPages = bulk ? Math.max(1, Math.ceil(bulk.rows.length / BULK_PAGE)) : 1;
  const bulkSlice = bulk ? bulk.rows.slice((bulkPage - 1) * BULK_PAGE, bulkPage * BULK_PAGE) : [];
  const width = bulk ? Math.max(1, bulk.maxRecords) : 1;
  const appBulkPages = appBulk ? Math.max(1, Math.ceil(appBulk.rows.length / BULK_PAGE)) : 1;
  const appBulkSlice = appBulk ? appBulk.rows.slice((appBulkPage - 1) * BULK_PAGE, appBulkPage * BULK_PAGE) : [];

  return (
    <div style={{ maxWidth: 1200 }}>
      <PageHead
        title="Allotment List"
        sub="Search the imported registrar records — one PAN at a time with an amount filter, or paste a whole column of PANs for a line each."
      />
      {err && <div className="banner bad" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="card"><div className="card-pad">
        {/* WHAT to search by, then HOW. The second control is hidden for a
            range, which has no bulk form. */}
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="seg" role="tablist" aria-label="Search by">
            <button className={field === 'pan' ? 'on' : ''} onClick={() => setField('pan')}>PAN</button>
            <button className={field === 'appno' ? 'on' : ''} onClick={() => setField('appno')}>Application No</button>
            <button className={field === 'range' ? 'on' : ''} onClick={() => setField('range')}>Application range</button>
          </div>
          {bulkable && (
            <div className="seg" role="tablist" aria-label="One or many">
              <button className={!isBulk ? 'on' : ''} onClick={() => setIsBulk(false)}>Single</button>
              <button className={isBulk ? 'on' : ''} onClick={() => setIsBulk(true)}>Bulk</button>
            </div>
          )}
        </div>

        <div className="filter-row">
          <div className="field" style={{ minWidth: 240, flex: '1 1 240px' }}>
            <label>IPO</label>
            <SearchSelect
              options={(ipos ?? []).map((i) => ({ value: i.id, label: `${i.symbol} — ${i.name}` }))}
              value={ipoId} onChange={setIpoId} disabled={ipos === null || busy} placeholder="Search IPO…"
            />
          </div>

          {tableView ? (
            <>
              {field === 'pan' && (
                <div className="field" style={{ width: 170 }}>
                  <label>PAN</label>
                  <input className="input mono" value={pan} maxLength={10} placeholder="AIOPC8724F"
                    onChange={(e) => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter') search(ipoId, 1); }} />
                </div>
              )}
              {/* NEVER uppercased, unlike PAN: 48 lakh of JPL's rows carry a
                  lowercase letter, so folding case would match nothing while
                  looking like an ordinary empty result. */}
              {field === 'appno' && (
                <>
                  <div className="field" style={{ width: 210 }}>
                    <label>Application No</label>
                    <input className="input mono" value={appNo} placeholder="UPJPL00000001"
                      onChange={(e) => setAppNo(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') search(ipoId, 1); }} />
                  </div>
                  <div className="field" style={{ width: 150 }}>
                    <label>Match</label>
                    <select className="input" value={appNoMode} onChange={(e) => setAppNoMode(e.target.value as api.AppNoMode)}>
                      {api.APP_NO_MODES.map((m) => (
                        <option key={m} value={m}>{api.APP_NO_MODE_LABEL[m]}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              {field === 'range' && (
                <>
                  <div className="field" style={{ width: 210 }}>
                    <label>From application No</label>
                    <input className="input mono" value={appFrom} placeholder="UPJPL00000001"
                      onChange={(e) => setAppFrom(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !rangeErr) search(ipoId, 1); }} />
                  </div>
                  <div className="field" style={{ width: 210 }}>
                    <label>To application No</label>
                    <input className="input mono" value={appTo} placeholder="UPJPL00001000"
                      onChange={(e) => setAppTo(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !rangeErr) search(ipoId, 1); }} />
                  </div>
                </>
              )}
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
              <button className="btn" disabled={busy || !ipoId || !!rangeErr} onClick={() => search(ipoId, 1)}>{busy ? 'Searching…' : 'Search'}</button>
              <button className="btn btn-ghost" disabled={busy} onClick={reset}>Reset</button>
              {/* A LINK, not a fetch: the export streams and a large IPO runs to
                  hundreds of MB, which must never be held in a browser variable.
                  It carries the same filters the table is showing, so what you get
                  is what you are looking at — including a range. */}
              <a
                className="btn btn-ghost"
                href={ipoId && !rangeErr ? api.allotmentCsvUrl(query) : undefined}
                aria-disabled={!ipoId || !result || !!rangeErr}
                style={!ipoId || !result || rangeErr ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
                title="Download the rows matching these filters as a CSV, which Excel opens directly"
              >Export to Excel</a>
            </>
          ) : panBulk ? (
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
          ) : (
            <>
              <div className="field" style={{ width: 150 }}>
                <label>Match</label>
                <select className="input" value={appNoMode} onChange={(e) => setAppNoMode(e.target.value as api.AppNoMode)}>
                  {api.APP_NO_MODES.map((m) => (
                    <option key={m} value={m}>{api.APP_NO_MODE_LABEL[m]}</option>
                  ))}
                </select>
              </div>
              <button className="btn" disabled={busy || !ipoId || !appPastedCount || appOverCap} onClick={runAppBulk}>
                {busy ? 'Searching…' : `Search ${appPastedCount ? fmtInt(appPastedCount) : ''}`}
              </button>
              <button className="btn btn-ghost" disabled={busy || !appNoText} onClick={() => { setAppNoText(''); setAppBulk(null); }}>Clear</button>
              <button className="btn btn-ghost" disabled={busy || !appBulk} onClick={exportAppBulk}
                title="Download these rows as a CSV, which Excel opens directly">Export to Excel</button>
            </>
          )}
        </div>

        {panBulk && (
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

        {appBulkOn && (
          <div className="field" style={{ marginTop: 4 }}>
            <label>Application numbers — paste a column from Excel; newlines, commas, spaces and tabs all work</label>
            <textarea className="input mono" rows={5} value={appNoText} placeholder={'UPJPL00000001\nUPJPL00000002\nGROWW000005b35bd'}
              onChange={(e) => setAppNoText(e.target.value)} disabled={busy}
              style={{ resize: 'vertical', lineHeight: 1.5 }} />
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              {fmtInt(appPastedCount)} number{appPastedCount === 1 ? '' : 's'} detected
              {appOverCap && (
                <span style={{ color: 'var(--neg-ink)' }}> — over the {fmtInt(appCap)} limit for {api.APP_NO_MODE_LABEL[appNoMode]}, split the list</span>
              )}
              {' · '}one line per number, matched exactly as written including upper and lower case
              {appNoMode === 'contains' && (
                <>
                  {' · '}
                  <b>Contains cannot use the index</b> — it is one full scan of the IPO, so the limit is{' '}
                  {fmtInt(api.APP_NO_BULK_CONTAINS_MAX)} and each extra number adds about a third of a second.
                  Use Exact or Starts with for a long list.
                </>
              )}
            </div>
          </div>
        )}

        {/* THE FOUND COUNT, so a gap in the series is visible without listing
            it. `rangeSpan` is null when it cannot be stated honestly — a Groww
            hex tail has no count, and a made-up denominator under a real
            numerator would be worse than no denominator. */}
        {field === 'range' && (rangeErr || (result && tableView)) && (
          <div style={{ marginTop: 10 }}>
            {rangeErr ? (
              <div className="banner bad" style={{ margin: 0 }}>{rangeErr}</div>
            ) : result && result.rangeSpan != null ? (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="pill">
                  {fmtInt(result.total)} of {fmtInt(result.rangeSpan)} in this range
                </span>
                {result.rangeSpan > result.total && (
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {fmtInt(result.rangeSpan - result.total)} application number
                    {result.rangeSpan - result.total === 1 ? '' : 's'} in the range are not in this registrar data
                  </span>
                )}
              </div>
            ) : result ? (
              <span className="muted" style={{ fontSize: 12.5 }}>
                {fmtInt(result.total)} found · this series has no numeric count, so there is no total to compare against
              </span>
            ) : null}
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

      {/* ── bulk PAN results ──────────────────────────────────────────── */}
      {panBulk && (
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

      {/* ── bulk application-number results ───────────────────────────── */}
      {/* FLAT, one row per number. Unlike the PAN report there is nothing to
          pivot: an application number is unique per IPO, so one number is one
          row and a block of repeated columns would be a block of one. */}
      {appBulkOn && (
        <div className="card" style={{ marginTop: 14 }}><div className="card-pad">
          {appBulk === null ? (busy ? <Loader /> : (
            <div className="muted" style={{ padding: '14px 0', textAlign: 'center' }}>Paste application numbers above and press Search.</div>
          )) : (
            <>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                <b>{appBulk.symbol}</b>
                <span className="pill">{fmtInt(appBulk.rows.length)} found</span>
                {appBulk.notFound.length > 0 && <span className="pill">{fmtInt(appBulk.notFound.length)} not in this file</span>}
                {appBulk.truncated && (
                  <span className="pill" style={{ background: 'var(--neg-soft)', color: 'var(--neg-ink)' }}>
                    more than {fmtInt(appBulk.rowMax)} matched — narrow the search
                  </span>
                )}
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {api.APP_NO_MODE_LABEL[appBulk.mode]} match on {fmtInt(appBulk.requested)} number{appBulk.requested === 1 ? '' : 's'}
                </span>
              </div>

              {appBulk.rows.length === 0 ? (
                <div className="muted" style={{ padding: '14px 0', textAlign: 'center' }}>None of those application numbers appears in this IPO&rsquo;s registrar data.</div>
              ) : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table">
                      <thead><tr>
                        <th>Application No</th><th>PAN</th><th>Name</th><th>Catg</th><th>TM Name</th>
                        <th style={{ textAlign: 'right' }}>Applied</th><th style={{ textAlign: 'right' }}>Amount</th>
                        <th style={{ textAlign: 'right' }}>Allotted</th><th style={{ textAlign: 'right' }}>Allotted ₹</th>
                        <th style={{ textAlign: 'right' }}>Refund ₹</th><th>Status</th><th>Reason</th>
                        {/* Only earns a column where a row need not look like
                            what was typed. */}
                        {appBulk.mode !== 'exact' && <th>Searched for</th>}
                      </tr></thead>
                      <tbody>
                        {appBulkSlice.map((r) => (
                          <tr key={r.applicationNo}>
                            <td className="mono" style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{r.applicationNo}</td>
                            <td className="mono">{r.pan || '—'}</td>
                            <td><div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name ?? ''}>{r.name || '—'}</div></td>
                            <td className="mono">{r.bidCatg || '—'}</td>
                            <td><div style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.tmName ?? ''}>{r.tmName || '—'}</div></td>
                            <td className="mono" style={{ textAlign: 'right' }}>{fmtInt(r.sharesApplied)}</td>
                            <td className="mono" style={{ textAlign: 'right' }}>{money(r.amountPaid)}</td>
                            <td className="mono" style={{ textAlign: 'right' }}>
                              {r.sharesAllotted > 0
                                ? <span style={{ color: 'var(--pos-ink)', fontWeight: 600 }}>{fmtInt(r.sharesAllotted)}</span>
                                : 0}
                            </td>
                            <td className="mono" style={{ textAlign: 'right' }}>{r.amountAllotted ? money(r.amountAllotted) : '—'}</td>
                            <td className="mono" style={{ textAlign: 'right' }}>{r.amountRefunded ? money(r.amountRefunded) : '—'}</td>
                            <td style={{ whiteSpace: 'nowrap', color: statusInk(r.applnStatus), fontWeight: 600, fontSize: 11.5 }}>{r.applnStatus}</td>
                            <td><div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reasonForRejection ?? ''}>{r.reasonForRejection || '—'}</div></td>
                            {appBulk.mode !== 'exact' && <td className="mono" style={{ whiteSpace: 'nowrap' }}>{r.matchedTerm}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {appBulkPages > 1 && (
                    <div className="row" style={{ gap: 10, marginTop: 12, alignItems: 'center', justifyContent: 'flex-end' }}>
                      <span className="muted" style={{ fontSize: 13 }}>
                        page {appBulkPage} of {fmtInt(appBulkPages)} · the Excel export carries all {fmtInt(appBulk.rows.length)} rows
                      </span>
                      <button className="btn btn-secondary btn-sm" disabled={appBulkPage <= 1} onClick={() => setAppBulkPage(appBulkPage - 1)}>‹ Prev</button>
                      <button className="btn btn-secondary btn-sm" disabled={appBulkPage >= appBulkPages} onClick={() => setAppBulkPage(appBulkPage + 1)}>Next ›</button>
                    </div>
                  )}
                </>
              )}

              {/* Reported, never silently dropped: "not in this registrar's
                  data" is frequently the answer the operator wants. */}
              {appBulk.notFound.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Not in this IPO&rsquo;s registrar data ({fmtInt(appBulk.notFound.length)})</div>
                  <div className="muted mono" style={{ fontSize: 12, wordBreak: 'break-all', lineHeight: 1.7 }}>{appBulk.notFound.join(' · ')}</div>
                </div>
              )}
            </>
          )}
        </div></div>
      )}

      {/* ── the record table: PAN, application number or a range ──────── */}
      {tableView && (
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
