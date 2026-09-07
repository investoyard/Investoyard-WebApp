'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHead } from '@/components/ui/Form';
import { Icon } from '@/components/Icon';
import { Loader } from '@/components/ui/Loader';
import { NoAccess } from '@/components/AdminUI';
import { Pager } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog, type ConfirmState } from '@/components/ui/Confirm';
import { useToast, Toasts } from '@/components/ui/Toast';
import { mayCancel, mayReviseTo } from '@investoyard/shared-types';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import * as api from '@/lib/tenants-admin';

/**
 * Bidding Report — every bid and where it stands.
 *
 * Edit, Cancel and Refresh (per row) are live. Rebid is not, and that is
 * deliberate: it would cancel a never-posted bid and create another never-
 * posted one until the first NSE UAT credential clears.
 *
 * Refresh is safe to expose today because the service is a no-op when the
 * exchange hasn't seen the bid yet — it returns the current stored
 * values with `refreshedAt` stamped, so an operator clicking on a
 * pre-posted row sees "no change from the exchange" rather than an
 * error. Once bids do start reaching an exchange, the button starts
 * doing real work automatically.
 *
 * App No, Bid Number, UPI Status and Rejection are all values the EXCHANGE
 * hands back, so they stay blank until a bid completes against a working
 * member credential. That is expected rather than broken, and the empty state
 * says so instead of leaving the operator to guess.
 */

/** Sort keys the API accepts. Anything else is ignored server-side. */
const COLS: { k: string; label: string; sort?: string; align?: 'r' }[] = [
  { k: 'appNo', label: 'App No', sort: 'appNo' },
  { k: 'name', label: 'Name', sort: 'name' },
  { k: 'pan', label: 'PAN' },
  { k: 'demat', label: 'Demat No' },
  { k: 'qty', label: 'Qty', sort: 'qty', align: 'r' },
  { k: 'price', label: 'Price', sort: 'price', align: 'r' },
  { k: 'rejection', label: 'Rejection' },
  { k: 'upiStatus', label: 'UPI Status' },
  { k: 'bidNumber', label: 'Bid Number', sort: 'bidNumber' },
  { k: 'actions', label: '' },
];

/**
 * What the buttons may do, decided from the same rule the server enforces.
 *
 * The screen disabling a control is a courtesy — it tells the operator why
 * before they click. It is NOT the guard: `mayReviseTo` / `mayCancel` run again
 * on the server, because a rule enforced only here is not a rule.
 */
function rights(r: api.BidRow) {
  const atExchange = !!r.appNo && !!r.rail;
  const cancel = mayCancel(r.category, atExchange);
  const settled = ['cancelled', 'allotted', 'not_allotted', 'released', 'rejected'].includes(r.status);
  return {
    atExchange,
    // a decided bid is history — editing it would rewrite the record, not the bid
    canEdit: !settled,
    canCancel: !settled && cancel.ok,
    // the floor the edit dialog applies: an HNI may only go up
    floor: mayReviseTo(r.category, r.qty, r.qty - 1, atExchange).ok ? 1 : r.qty,
    why: settled ? `This bid is ${r.status.replace(/_/g, ' ')}.` : cancel.reason,
  };
}

const inr = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function BiddingReportPage() {
  const me = useOperator();
  const [rows, setRows] = useState<api.BidRow[] | null>(null);
  const [facets, setFacets] = useState<Awaited<ReturnType<typeof api.fetchBidFacets>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [ipoId, setIpoId] = useState('');
  const [memberCredentialId, setMember] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [edit, setEdit] = useState<{ row: api.BidRow; qty: string; floor: number } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [saving, setSaving] = useState(false);
  const { toasts, push } = useToast();

  const load = useCallback(async (p = page, s = sort, d = dir) => {
    setBusy(true); setErr(null);
    try {
      const r = await api.fetchBidReport({
        ipoId, memberCredentialId, status, category, from, to, q,
        sort: s, dir: d, page: p, per,
      });
      setRows(r.rows); setTotal(r.total); setPages(r.pages); setPage(r.page);
    } catch (e: any) { setErr(String(e?.message ?? e)); setRows([]); }
    finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipoId, memberCredentialId, status, category, from, to, q, per, page, sort, dir]);

  useEffect(() => { api.fetchBidFacets().then(setFacets).catch(() => {}); }, []);
  // filters other than the free-text box apply immediately; search waits for Enter
  useEffect(() => { void load(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },
    [ipoId, memberCredentialId, status, category, from, to, per]);

  /** Clicking a header sorts by it, and clicking again reverses. */
  const sortBy = (key?: string) => {
    if (!key) return;
    const d: 'asc' | 'desc' = sort === key && dir === 'desc' ? 'asc' : 'desc';
    setSort(key); setDir(d); void load(1, key, d);
  };

  const anyFilter = useMemo(
    () => !!(ipoId || memberCredentialId || status || category || from || to || q),
    [ipoId, memberCredentialId, status, category, from, to, q],
  );
  const clear = () => {
    setIpoId(''); setMember(''); setStatus(''); setCategory(''); setFrom(''); setTo(''); setQ('');
  };

  /* ── actions ─────────────────────────────────────────────────────────── */

  const askCancel = (r: api.BidRow, atExchange: boolean) => setConfirm({
    title: 'Cancel this bid?',
    danger: true,
    confirmLabel: 'Cancel bid',
    message: (
      <>
        <b>{r.name}</b> — {r.qty.toLocaleString('en-IN')} shares of {r.ipoSymbol}.
        {atExchange
          // the exchange must be told, and that is not instant
          ? <> The withdrawal will be sent to the exchange.</>
          // nothing to withdraw there; this is our own record
          : <> This bid has not been sent to an exchange, so only our record changes.</>}
        {' '}The investor can apply again afterwards.
      </>
    ),
    onConfirm: async () => {
      try {
        await api.cancelBid(r.id);
        push('Bid cancelled.');
        await load();
      } catch (e: any) { push(String(e?.message ?? e), 'err'); }
    },
  });

  /**
   * Refresh one bid's exchange status. Optimistic in the sense that we
   * simply reload the whole page after — the server has already written
   * the freshest values through the same code path a callback uses, so a
   * page reload lands them in every column at once. Cheap enough (200
   * row cap) and simpler than mutating one row in place.
   */
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const refreshOne = async (r: api.BidRow) => {
    setRefreshingId(r.id);
    try {
      const res = await api.refreshBid(r.id);
      // Message is truthful about no-op — a refresh with no new data is
      // still a successful call; the operator sees "no change" rather
      // than mistaking silence for failure.
      const changed = (res.status !== r.status) || (res.upiStatusText ?? '') !== (r.upiStatus ?? '');
      push(changed ? 'Refreshed from the exchange.' : 'No change from the exchange.');
      if (changed) await load();
    } catch (e: any) {
      push(String(e?.message ?? e), 'err');
    } finally { setRefreshingId(null); }
  };

  const saveEdit = async () => {
    if (!edit) return;
    const qty = Number(edit.qty);
    if (!Number.isFinite(qty) || qty < 1) { push('Enter a quantity of at least 1.', 'err'); return; }
    if (qty < edit.floor) {
      // the same refusal the server would give, said before the round trip
      push(`This bid may only be revised upward — ${edit.floor.toLocaleString('en-IN')} or more.`, 'err');
      return;
    }
    setSaving(true);
    try {
      await api.editBid(edit.row.id, qty);
      push('Quantity revised.');
      setEdit(null);
      await load();
    } catch (e: any) { push(String(e?.message ?? e), 'err'); }
    finally { setSaving(false); }
  };

  // hooks above every guard — a conditional return before them re-orders the
  // hook list on the next render and throws React #310
  if (!operatorCan(me, 'bids.view')) return <NoAccess />;

  return (
    <div>
      <PageHead
        title="Bidding Report"
        sub="Every bid, what the exchange said, and where it stands. Edit, cancel, and refresh a single bid from the row actions."
        actions={<button className="btn btn-secondary" disabled={busy} onClick={() => load()}>
          <Icon name="refresh" size={15} /> {busy ? 'Loading…' : 'Refresh'}
        </button>}
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="card" style={{ marginBottom: 14 }}><div className="card-pad">
        <div className="filter-row">
          <div className="field" style={{ width: 190 }}>
            <label>IPO</label>
            <select className="input" value={ipoId} onChange={(e) => setIpoId(e.target.value)}>
              <option value="">All IPOs</option>
              {facets?.ipos.map((i) => <option key={i.id} value={i.id}>{i.symbol}</option>)}
            </select>
          </div>
          <div className="field" style={{ width: 210 }}>
            <label>Member</label>
            <select className="input" value={memberCredentialId} onChange={(e) => setMember(e.target.value)}>
              <option value="">All members</option>
              {facets?.members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ width: 165 }}>
            <label>Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {facets?.statuses.map((s) => (
                <option key={s.value} value={s.value}>{s.value.replace(/_/g, ' ')} ({s.count})</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 150 }}>
            <label>Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {facets?.categories.map((c) => <option key={c.value} value={c.value}>{c.value} ({c.count})</option>)}
            </select>
          </div>
          <div className="field" style={{ width: 150 }}>
            <label>From</label>
            <input type="date" className="input mono" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ width: 150 }}>
            <label>To</label>
            <input type="date" className="input mono" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="field" style={{ flex: '1 1 210px' }}>
            <label>Search</label>
            <input className="input" value={q} placeholder="name, application no or bid no"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); void load(1); } }} />
          </div>
          <button className="btn" onClick={() => { setPage(1); void load(1); }}>
            <Icon name="search" size={15} /> Search
          </button>
          {anyFilter && (
            <button className="btn btn-secondary" onClick={() => { clear(); setPage(1); }}>Clear</button>
          )}
        </div>
      </div></div>

      <div className="card"><div className="card-pad">
        {rows === null ? <Loader /> : rows.length === 0 ? (
          <div style={{ padding: '38px 8px', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>No bids match</h3>
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              {anyFilter
                ? 'Try clearing a filter or widening the date range.'
                : 'No applications have been recorded yet.'}
            </p>
          </div>
        ) : (
          <>
            <div className="bid-tbl">
              <table className="table">
                <thead>
                  <tr>
                    {/* `th-sort` + `.arrow` are the admin table's own sort
                        affordance — same markup as the catalog list, so the
                        two screens behave identically. */}
                    {COLS.map((c) => (
                      <th key={c.k}
                        className={c.sort ? `th-sort ${sort === c.sort ? 'on' : ''}` : undefined}
                        style={c.align === 'r' ? { textAlign: 'right' } : undefined}
                        onClick={() => sortBy(c.sort)}>
                        {c.label}
                        {c.sort && <span className="arrow">{sort === c.sort ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.appNo ?? <span className="muted" title="Assigned by the exchange once the bid is placed">—</span>}</td>
                      <td>
                        <div className="bid-name">{r.name || '—'}</div>
                        <div className="bid-sub">
                          {r.ipoSymbol}
                          {r.category && <> · {r.category}</>}
                          {!r.memberCode && <> · <span className="bid-byfile" title="Not yet posted to an exchange by API">BYFILE</span></>}
                        </div>
                      </td>
                      <td className="mono">{r.pan || <span className="muted">—</span>}</td>
                      <td className="mono">{r.demat ?? <span className="muted">—</span>}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{r.qty ? r.qty.toLocaleString('en-IN') : '—'}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        {inr(r.price)}
                        {r.atCutoff && <span className="bid-cutoff" title="Bid at cut-off">C</span>}
                      </td>
                      <td>{r.rejection
                        ? <span className="bid-reject" title={r.rejection}>{r.rejection}</span>
                        : <span className="muted">—</span>}</td>
                      <td>{r.upiStatus ?? <span className="muted">—</span>}</td>
                      <td className="mono">{r.bidNumber ?? <span className="muted">—</span>}</td>
                      <td>
                        {(() => {
                          const g = rights(r);
                          return (
                            <div className="bid-acts">
                              <button className="icon-btn" title={g.canEdit ? 'Edit quantity' : g.why}
                                disabled={!g.canEdit} onClick={() => setEdit({ row: r, qty: String(r.qty), floor: g.floor })}>
                                <Icon name="edit" size={14} />
                              </button>
                              {/* Refresh is only meaningful once the bid is at the
                                  exchange — nothing to pull otherwise. Disabled
                                  state carries the reason so the operator sees
                                  why before they click. */}
                              <button
                                className="icon-btn"
                                title={g.atExchange ? 'Refresh UPI status from the exchange' : 'This bid has not been sent to the exchange yet — nothing to refresh.'}
                                disabled={!g.atExchange || refreshingId === r.id}
                                onClick={() => refreshOne(r)}
                              >
                                <Icon name="refresh" size={14} />
                              </button>
                              <button className="icon-btn danger" title={g.canCancel ? 'Cancel this bid' : g.why}
                                disabled={!g.canCancel} onClick={() => askCancel(r, g.atExchange)}>
                                <Icon name="trash" size={14} />
                              </button>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={page} pages={pages} total={total} per={per}
              from={(page - 1) * per + 1} to={Math.min(page * per, total)}
              onPage={(p) => { setPage(p); void load(p); }}
              onPer={(n) => { setPer(n); setPage(1); }}
            />
          </>
        )}
      </div></div>

      {edit && (
        <Modal title="Revise quantity" sub={`${edit.row.name} — ${edit.row.ipoSymbol}`} onClose={() => setEdit(null)}>
          <div className="field">
            <label>Quantity (shares)</label>
            <input className="input mono" autoFocus value={edit.qty} inputMode="numeric"
              onChange={(e) => setEdit({ ...edit, qty: e.target.value.replace(/[^\d]/g, '') })}
              onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit(); }} />
            <span className="hint">
              Currently {edit.row.qty.toLocaleString('en-IN')}.
              {edit.floor > 1
                /* the ICDR direction rule, said in the place it applies */
                ? <> This is an {edit.row.category} bid, so it may only be revised <b>upward</b> — {edit.floor.toLocaleString('en-IN')} or more.</>
                : <> A retail bid may be revised either way.</>}
            </span>
          </div>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button className="btn btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
            <button className="btn" disabled={saving} onClick={() => void saveEdit()}>
              {saving ? 'Saving…' : 'Save quantity'}
            </button>
          </div>
        </Modal>
      )}

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
      <Toasts toasts={toasts} />
    </div>
  );
}
