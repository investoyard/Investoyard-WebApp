'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, SearchBox, Field, FormActions } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { usePagination } from '@/components/ui/Pagination';
import { ConfirmDialog, type ConfirmState } from '@/components/ui/Confirm';
import { RowMenu } from '@/components/ui/RowMenu';
import { Loader } from '@/components/ui/Loader';
import { Toasts, useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/Icon';
import { ipoPhase, priceBand, type IpoPhase } from '@/lib/format';
import { CompletenessCell } from '@/components/CompletenessCell';
import * as api from '@/lib/tenants-admin';

/**
 * The phase filter is a DROPDOWN, not the segmented control it used to be
 * (operator, 2026-10-06). Six buttons took the whole toolbar, and Year and Type
 * had to go somewhere — the counts that made the segments useful now ride in the
 * option labels, so nothing is lost.
 */
const FILTERS: { key: IpoPhase | 'all'; label: string }[] = [
  { key: 'all', label: 'All statuses' }, { key: 'live', label: 'Live' }, { key: 'upcoming', label: 'Upcoming' },
  { key: 'allotment', label: 'Allotment' }, { key: 'listed', label: 'Listed' }, { key: 'closed', label: 'Closed' },
];

type BoardFilter = 'all' | 'mainboard' | 'sme';
const BOARDS: { key: BoardFilter; label: string }[] = [
  { key: 'all', label: 'All types' }, { key: 'mainboard', label: 'Mainboard' }, { key: 'sme', label: 'SME' },
];

/**
 * An issue's YEAR is its OPEN date's. Every one of the 1,268 visible records
 * carries one, and it is what "the 2026 IPOs" means to anyone reading this
 * screen — a listing date would file a 30 Dec issue under the following year.
 *
 * A record with NO open date is shown in EVERY year, deliberately: that is a
 * freshly-added issue whose dates have not been filled in yet, which is exactly
 * the record needing attention, and hiding it the moment it is saved would read
 * as a failed save.
 */
const yearOf = (i: api.AdminIpo): string | null => (i.openDate ? String(i.openDate).slice(0, 4) : null);

export default function AdminCatalog() {
  const me = useOperator();
  const [ipos, setIpos] = useState<api.AdminIpo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<IpoPhase | 'all'>('all');
  const [board, setBoard] = useState<BoardFilter>('all');
  /** `''` until the data arrives and the default year is picked; `'all'` = every year. */
  const [year, setYear] = useState<string>('');

  // admin sees EVERYTHING, including bulk-imported rows the public site hides
  const load = useCallback(async () => {
    try { setIpos(await api.fetchAllIpos()); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setErr(null);
    try { await fn(); await load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  // OPS gate badges (B / P) — one-click toggle, optimistic flip, revert on error.
  const { toasts, push: toast } = useToast();
  const [opsBusy, setOpsBusy] = useState<string | null>(null);
  const setOpsLocal = (id: string, key: 'startBid' | 'startPrint', val: boolean) =>
    setIpos((list) => list.map((x) => (x.id === id ? { ...x, extra: { ...x.extra, [key]: val } } : x)));
  const toggleOps = async (i: api.AdminIpo, key: 'startBid' | 'startPrint') => {
    const cur = i.extra?.[key] === true;
    const label = key === 'startBid' ? 'Start Bid' : 'Start Printing';
    setOpsBusy(`${i.id}:${key}`);
    setOpsLocal(i.id, key, !cur);
    try {
      await api.updateIpoOps(i.id, { [key]: !cur });
      toast(`${i.symbol} — ${label} turned ${cur ? 'OFF' : 'ON'}`, 'ok');
    } catch (e: any) {
      setOpsLocal(i.id, key, cur);
      toast(`${i.symbol} — ${label} failed: ${String(e?.message ?? e)}`, 'err');
    } finally { setOpsBusy(null); }
  };

  // Bulk-imported rows are hidden from the public site until published (one click).
  const togglePublished = async (i: api.AdminIpo) => {
    const hidden = i.hidden === true;
    const patch = (val: boolean | undefined) =>
      setIpos((list) => list.map((x) => (x.id === i.id ? { ...x, hidden: val } : x)));
    setOpsBusy(`${i.id}:pub`);
    patch(hidden ? undefined : true);
    try {
      await api.publishImportedIpos([i.symbol], hidden);
      toast(`${i.symbol} — ${hidden ? 'published to the site' : 'hidden from the site'}`, 'ok');
    } catch (e: any) {
      patch(hidden ? true : undefined);
      toast(`${i.symbol} — ${String(e?.message ?? e)}`, 'err');
    } finally { setOpsBusy(null); }
  };
  // GMP & Listing — quick-entry POPUP (was a separate page). Values load from
  // the full detail so the extra JSON merges safely on save.
  const [gmpFor, setGmpFor] = useState<api.AdminIpo | null>(null);
  const [gmpDetail, setGmpDetail] = useState<api.AdminIpoDetail | null>(null);
  const [gmpForm, setGmpForm] = useState({ gmp: '', gainPct: '', bse: '', nse: '' });
  const [gmpBusy, setGmpBusy] = useState(false);
  const [gmpErr, setGmpErr] = useState<string | null>(null);
  const openGmp = (i: api.AdminIpo) => {
    setGmpFor(i); setGmpDetail(null); setGmpErr(null);
    api.fetchIpo(i.id).then((d) => {
      setGmpDetail(d);
      const ex: any = d.extra ?? {};
      setGmpForm({
        gmp: d.gmp != null ? String(d.gmp) : '',
        gainPct: d.listingGainPct != null ? String(d.listingGainPct) : '',
        bse: ex.bseListingPrice != null ? String(ex.bseListingPrice) : '',
        nse: ex.nseListingPrice != null ? String(ex.nseListingPrice) : '',
      });
    }).catch((e) => setGmpErr(String(e?.message ?? e)));
  };
  const saveGmp = async () => {
    if (!gmpFor || !gmpDetail) return;
    setGmpBusy(true); setGmpErr(null);
    try {
      const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
      // Day-wise GMP log — one entry per day (latest save wins), drives the
      // detail page's real GMP trend. Kept to the last 30 days.
      const ex: any = gmpDetail.extra ?? {};
      const day = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const gmpVal = num(gmpForm.gmp);
      const gmpLog = gmpVal != null
        ? [...(Array.isArray(ex.gmpLog) ? ex.gmpLog : []).filter((e: any) => e?.d !== day),
           { d: day, gmp: gmpVal, pct: num(gmpForm.gainPct) ?? null }].slice(-30)
        : (Array.isArray(ex.gmpLog) ? ex.gmpLog : []);
      await api.updateIpo(gmpFor.id, {
        gmp: gmpVal, listingGainPct: num(gmpForm.gainPct),
        extra: { ...ex, bseListingPrice: gmpForm.bse, nseListingPrice: gmpForm.nse, gmpLog },
      });
      setGmpFor(null);
      await load();
    } catch (e: any) { setGmpErr(String(e?.message ?? e)); }
    finally { setGmpBusy(false); }
  };

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const askDelete = (i: api.AdminIpo) => setConfirm({
    title: `Delete ${i.symbol}?`, danger: true, confirmLabel: 'Delete IPO',
    message: <>This permanently removes <b>{i.name}</b> from the catalog. This can’t be undone.</>,
    onConfirm: () => run(() => api.deleteIpo(i.id)),
  });

  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const toggleSort = (k: string) => setSort((s) => (s?.k === k ? { k, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { k, dir: 1 }));
  const sortVal = ({ i, ph }: { i: api.AdminIpo; ph: { label: string } }, k: string): string | number => {
    switch (k) {
      case 'symbol': return i.symbol;
      case 'name': return i.name.toLowerCase();
      case 'type': return i.type;
      case 'band': return i.priceBandMin ?? 0;
      case 'lot': return i.lotSize ?? 0;
      case 'gmp': return i.gmp ?? -Infinity;
      case 'open': return i.openDate ?? '';
      case 'close': return i.closeDate ?? '';
      case 'status': return ph.label;
      default: return '';
    }
  };

  /** Decorated once — `ipoPhase` and the year are read by the rows AND by all
   *  three facet counts, so deriving them per-filter would run nine times. */
  const all = useMemo(
    () => ipos.map((i) => ({ i, ph: ipoPhase(i), yr: yearOf(i) })),
    [ipos],
  );

  const years = useMemo(() => {
    const s = new Set<string>();
    for (const r of all) if (r.yr) s.add(r.yr);
    return [...s].sort().reverse();
  }, [all]);

  /* Default to the CURRENT year — but only once, and only if it has records.
     Re-running this on every `load()` would throw away the operator's own
     choice after each badge toggle or GMP save; and in early January, before
     the first issue of the year is entered, pinning to a year with nothing in
     it would open the screen empty, so it falls back to the newest year held. */
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || years.length === 0) return;
    defaulted.current = true;
    const now = String(new Date().getFullYear());
    setYear(years.includes(now) ? now : years[0]);
  }, [years]);

  /* A SEARCH IGNORES THE YEAR (operator's call, 2026-10-06). With the year
     pinned to the current one, searching a 2019 symbol would return nothing and
     read as missing data rather than as a filter — the same reasoning that keeps
     the front site's search reaching the whole catalogue. The note under the bar
     says so, so an unexpectedly wide result set is never a surprise. */
  const searching = q.trim().length > 0;

  const keep = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return (r: typeof all[number], skip?: 'year' | 'board' | 'phase') =>
      (skip === 'year' || searching || year === '' || year === 'all' || r.yr === null || r.yr === year)
      && (skip === 'board' || board === 'all' || (board === 'sme' ? r.i.type === 'sme' : r.i.type !== 'sme'))
      && (skip === 'phase' || filter === 'all' || r.ph.phase === filter)
      && (!ql || r.i.symbol.toLowerCase().includes(ql) || r.i.name.toLowerCase().includes(ql));
  }, [q, searching, year, board, filter]);

  const rows = useMemo(() => {
    let out = all.filter((r) => keep(r));
    if (sort) {
      out = [...out].sort((a, b) => { const va = sortVal(a, sort.k), vb = sortVal(b, sort.k); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; });
    }
    return out;
  }, [all, keep, sort]);

  /* FACET counts — each dimension counts what the OTHER filters leave, which is
     how a filter bar is expected to behave: the Status options show how many
     live issues there are *in the year and board you are looking at*. Counting
     the whole catalogue instead is the fault that once put "SME 42" over a page
     showing eleven. */
  const counts = useMemo(() => {
    const phase: Record<string, number> = {};
    const byBoard: Record<string, number> = { all: 0, mainboard: 0, sme: 0 };
    const byYear: Record<string, number> = {};
    for (const r of all) {
      if (keep(r, 'phase')) phase[r.ph.phase] = (phase[r.ph.phase] ?? 0) + 1;
      if (keep(r, 'board')) {
        byBoard.all += 1;
        byBoard[r.i.type === 'sme' ? 'sme' : 'mainboard'] += 1;
      }
      if (keep(r, 'year') && r.yr) byYear[r.yr] = (byYear[r.yr] ?? 0) + 1;
    }
    return { phase, board: byBoard, year: byYear };
  }, [all, keep]);

  const { slice, node: pager } = usePagination(rows, 10);

  if (!operatorCan(me, 'ipos.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'ipos.manage');
  const SortTh = ({ k, label, right }: { k: string; label: string; right?: boolean }) => (
    <th className={`th-sort ${sort?.k === k ? 'on' : ''}`} style={right ? { textAlign: 'right' } : undefined} onClick={() => toggleSort(k)}>
      {label}<span className="arrow">{sort?.k === k ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span>
    </th>
  );

  return (
    <>
      <Toasts toasts={toasts} />
      <PageHead
        title="IPO catalog"
        sub="The live catalog every tenant reads. Status is derived automatically from each issue’s timeline."
        actions={canManage ? <a className="btn" href="/admin/catalog/new">＋ Add IPO</a> : undefined}
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="filter-bar">
        <label className="filter">
          <span className="fl">Year</span>
          <select className="input" style={{ minWidth: 128 }} value={year}
            onChange={(e) => setYear(e.target.value)} disabled={years.length === 0}>
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}{counts.year[y] ? ` (${counts.year[y]})` : ''}</option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span className="fl">Type</span>
          <select className="input" style={{ minWidth: 150 }} value={board}
            onChange={(e) => setBoard(e.target.value as BoardFilter)}>
            {BOARDS.map((b) => (
              <option key={b.key} value={b.key}>{b.label} ({counts.board[b.key] ?? 0})</option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span className="fl">Status</span>
          <select className="input" style={{ minWidth: 150 }} value={filter}
            onChange={(e) => setFilter(e.target.value as IpoPhase | 'all')}>
            {FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}{f.key === 'all' ? '' : ` (${counts.phase[f.key] ?? 0})`}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span className="fl">Search</span>
          <SearchBox value={q} onChange={setQ} placeholder="Search symbol or name…" />
        </label>
        <span className="fb-end">
          <span className="fb-count">
            {rows.length.toLocaleString('en-IN')} of {ipos.length.toLocaleString('en-IN')}
          </span>
        </span>
      </div>
      {searching && (
        <div className="muted" style={{ fontSize: 12.5, margin: '-6px 0 14px' }}>
          Searching the whole catalogue — the Year filter is ignored while there’s a search term.
        </div>
      )}

      <div className="card">
        {/* The badge counts the rows IN THIS TABLE, not the catalogue. It read
            `ipos.length` before the filters existed, which with Year defaulting
            to the current one would have printed 1,268 above 163 visible rows —
            the same fault as the home page's "SME 42" over eleven cards. The
            catalogue total is still on screen, in the `fb-count` above. */}
        <div className="card-head"><span className="t">IPO catalog <span className="count-badge">{rows.length.toLocaleString('en-IN')}</span></span></div>
        {loading ? <Loader /> : rows.length === 0 ? (
          <div className="card-pad muted">
            {ipos.length === 0
              ? <>No IPOs yet. {canManage && <a className="linklike" href="/admin/catalog/new">Add the first one →</a>}</>
              : <>No issues match these filters.{year !== 'all' && !searching && <> Try <button type="button" className="linklike" onClick={() => setYear('all')}>all years</button>.</>}</>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr>
                <th></th>
                <SortTh k="symbol" label="Symbol" /><SortTh k="name" label="Name" /><SortTh k="type" label="Category" />
                <SortTh k="band" label="Band" /><SortTh k="lot" label="Lot" /><SortTh k="open" label="Open" />
                <SortTh k="close" label="Close" /><th title="Operator gates: Bid / Print (set in Edit or IPO Operations)">Ops</th><SortTh k="status" label="Status" />
                {canManage && <th style={{ textAlign: 'right' }}>Action</th>}
              </tr></thead>
              <tbody>
                {slice.map(({ i, ph }) => (
                  <tr key={i.id}>
                    <td>{i.logoUrl ? <img src={i.logoUrl} alt="" width={28} height={28} style={{ borderRadius: 7, objectFit: 'contain', background: '#fff', border: '1px solid var(--border)' }} /> : <span style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--bg-2)', display: 'inline-block' }} />}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{i.symbol}</td>
                    <td>
                      <div className="cat-name-cell">
                        <span className="cat-name">{i.name}</span>
                        <CompletenessCell ipo={i} editHref={`/admin/catalog/edit?id=${i.id}`} />
                      </div>
                    </td>
                    <td><span className={`chip ${i.type === 'sme' ? 'sme' : 'mainboard'}`} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999 }}>{i.extra?.categoryName || (i.type === 'sme' ? 'SME' : 'Mainboard')}</span></td>
                    <td className="mono">{priceBand(i.priceBandMin, i.priceBandMax)}</td>
                    <td className="mono">{i.lotSize ?? '—'}</td>
                    <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{i.openDate ?? '—'}</td>
                    <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{i.closeDate ?? '—'}</td>
                    {/* read-only operator-gate indicators (toggles live in IPO Operations) */}
                    <td>
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        {i.hidden === true ? (
                          canManage ? (
                            <button type="button" className="ops-badge hid" disabled={opsBusy === `${i.id}:pub`}
                              title="Imported — hidden from the public site. Click to publish."
                              onClick={() => togglePublished(i)}>H</button>
                          ) : (
                            <span className="ops-badge hid" title="Imported — hidden from the public site">H</span>
                          )
                        ) : null}
                        {([['startBid', 'B', 'Start Bid'], ['startPrint', 'P', 'Start Printing']] as const).map(([key, ch, label]) => {
                          const on = i.extra?.[key] === true;
                          return canManage ? (
                            <button key={key} type="button" className={`ops-badge${on ? ' on' : ''}`}
                              disabled={opsBusy === `${i.id}:${key}`}
                              title={`${label} ${on ? 'ON' : 'OFF'} — click to turn ${on ? 'off' : 'on'}`}
                              onClick={() => toggleOps(i, key)}>{ch}</button>
                          ) : (
                            <span key={key} className={`ops-badge${on ? ' on' : ''}`} title={`${label} ${on ? 'ON' : 'OFF'}`}>{ch}</span>
                          );
                        })}
                      </span>
                    </td>
                    <td style={{ width: '1%', whiteSpace: 'nowrap' }}><span className={`ph ${ph.phase}`}>{ph.label}</span></td>
                    {canManage && (
                      <td style={{ width: '1%', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <span className="row-actions">
                          <a className="icon-btn" href={`/admin/catalog/view?id=${i.id}`} title="View details"><Icon name="eye" size={14} /></a>
                          <a className="icon-btn" href={`/admin/catalog/edit?id=${i.id}`} title="Edit"><Icon name="edit" size={14} /></a>
                          <button className="icon-btn" onClick={() => openGmp(i)} title="GMP & Listing"><Icon name="trending" size={14} /></button>
                          <RowMenu>
                            <button className="danger" disabled={busy} onClick={() => askDelete(i)}><Icon name="trash" size={15} /> Delete IPO</button>
                          </RowMenu>
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && pager}
      </div>
      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}

      {gmpFor && (
        <Modal
          title={`GMP & Listing — ${gmpFor.symbol}`}
          sub={`${gmpFor.name} · GMP is unofficial and always shown with the disclaimer.`}
          onClose={() => setGmpFor(null)}
        >
          {gmpErr && <div className="banner warn" style={{ marginBottom: 14 }}>{gmpErr}</div>}
          {!gmpDetail ? <Loader /> : (
            <>
              <div className="form-grid">
                <Field label="GMP (₹)" hint="grey-market premium per share"><input className="input mono" value={gmpForm.gmp} onChange={(e) => setGmpForm({ ...gmpForm, gmp: e.target.value })} /></Field>
                <Field label="Listing gain (%)"><input className="input mono" value={gmpForm.gainPct} onChange={(e) => setGmpForm({ ...gmpForm, gainPct: e.target.value })} /></Field>
                <Field label="NSE Listing Price (₹)"><input className="input mono" value={gmpForm.nse} onChange={(e) => setGmpForm({ ...gmpForm, nse: e.target.value })} placeholder="0.00" /></Field>
                <Field label="BSE Listing Price (₹)"><input className="input mono" value={gmpForm.bse} onChange={(e) => setGmpForm({ ...gmpForm, bse: e.target.value })} placeholder="0.00" /></Field>
              </div>
              <FormActions>
                <button className="btn" disabled={gmpBusy} onClick={saveGmp}>{gmpBusy ? 'Saving…' : 'Save'}</button>
                <button className="btn btn-secondary" onClick={() => setGmpFor(null)}>Cancel</button>
              </FormActions>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
