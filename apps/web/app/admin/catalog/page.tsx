'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

const FILTERS: { key: IpoPhase | 'all'; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'live', label: 'Live' }, { key: 'upcoming', label: 'Upcoming' },
  { key: 'allotment', label: 'Allotment' }, { key: 'listed', label: 'Listed' }, { key: 'closed', label: 'Closed' },
];

export default function AdminCatalog() {
  const me = useOperator();
  const [ipos, setIpos] = useState<api.AdminIpo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<IpoPhase | 'all'>('all');

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

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let out = ipos
      .map((i) => ({ i, ph: ipoPhase(i) }))
      .filter(({ i, ph }) =>
        (filter === 'all' || ph.phase === filter) &&
        (!ql || i.symbol.toLowerCase().includes(ql) || i.name.toLowerCase().includes(ql)));
    if (sort) {
      out = [...out].sort((a, b) => { const va = sortVal(a, sort.k), vb = sortVal(b, sort.k); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; });
    }
    return out;
  }, [ipos, q, filter, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of ipos) { const p = ipoPhase(i).phase; c[p] = (c[p] ?? 0) + 1; }
    return c;
  }, [ipos]);

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

      <div className="tbl-toolbar">
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>
              {f.label}{f.key !== 'all' && counts[f.key] ? <span style={{ opacity: .6, marginLeft: 5 }}>{counts[f.key]}</span> : ''}
            </button>
          ))}
        </div>
        <span className="spacer" style={{ flex: 1 }} />
        <SearchBox value={q} onChange={setQ} placeholder="Search symbol or name…" />
      </div>

      <div className="card">
        <div className="card-head"><span className="t">IPO catalog <span className="count-badge">{ipos.length}</span></span></div>
        {loading ? <Loader /> : rows.length === 0 ? (
          <div className="card-pad muted">{ipos.length === 0 ? <>No IPOs yet. {canManage && <a className="linklike" href="/admin/catalog/new">Add the first one →</a>}</> : 'No issues match.'}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr>
                <th></th>
                <SortTh k="symbol" label="Symbol" /><SortTh k="name" label="Name" /><SortTh k="type" label="Category" />
                <SortTh k="band" label="Band" /><SortTh k="lot" label="Lot" /><SortTh k="open" label="Open" />
                <SortTh k="close" label="Close" /><th title="Operator gates: Bid / Print (set in Edit or IPO Operations)">Ops</th><SortTh k="status" label="Status" />
                <th title="How much of the IPO's detail is filled in — click for the checklist">Complete</th>
                {canManage && <th style={{ textAlign: 'right' }}>Action</th>}
              </tr></thead>
              <tbody>
                {slice.map(({ i, ph }) => (
                  <tr key={i.id}>
                    <td>{i.logoUrl ? <img src={i.logoUrl} alt="" width={28} height={28} style={{ borderRadius: 7, objectFit: 'contain', background: '#fff', border: '1px solid var(--border)' }} /> : <span style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--bg-2)', display: 'inline-block' }} />}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{i.symbol}</td>
                    <td>{i.name}</td>
                    <td><span className={`chip ${i.type === 'sme' ? 'sme' : 'mainboard'}`} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999 }}>{i.extra?.categoryName || (i.type === 'sme' ? 'SME' : 'Mainboard')}</span></td>
                    <td className="mono">{priceBand(i.priceBandMin, i.priceBandMax)}</td>
                    <td className="mono">{i.lotSize ?? '—'}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{i.openDate ?? '—'}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{i.closeDate ?? '—'}</td>
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
                    <td><span className={`ph ${ph.phase}`}>{ph.label}</span></td>
                    <td>
                      <CompletenessCell ipo={i} editHref={`/admin/catalog/edit?id=${i.id}`} />
                    </td>
                    {canManage && (
                      <td>
                        <span className="row-actions">
                          <a className="icon-btn" href={`/admin/catalog/view?id=${i.id}`} title="View details"><Icon name="eye" size={15} /></a>
                          <a className="icon-btn" href={`/admin/catalog/edit?id=${i.id}`} title="Edit"><Icon name="edit" size={15} /></a>
                          <button className="icon-btn" onClick={() => openGmp(i)} title="GMP & Listing"><Icon name="trending" size={15} /></button>
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
