'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, SearchBox } from '@/components/ui/Form';
import { usePagination } from '@/components/ui/Pagination';
import { ConfirmDialog, type ConfirmState } from '@/components/ui/Confirm';
import { RowMenu } from '@/components/ui/RowMenu';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import { ipoPhase, priceBand, type IpoPhase } from '@/lib/format';
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

  const load = useCallback(async () => {
    try { setIpos(await api.fetchIpos()); setErr(null); }
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
                <SortTh k="close" label="Close" /><SortTh k="gmp" label="GMP" /><SortTh k="status" label="Status" />
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
                    <td className="mono" style={{ color: i.gmp != null ? 'var(--pos)' : undefined }}>{i.gmp != null ? `+${i.gmp}` : '—'}</td>
                    <td><span className={`ph ${ph.phase}`}>{ph.label}</span></td>
                    {canManage && (
                      <td>
                        <span className="row-actions">
                          <a className="icon-btn" href={`/admin/catalog/view?id=${i.id}`} title="View details"><Icon name="eye" size={15} /></a>
                          <a className="icon-btn" href={`/admin/catalog/edit?id=${i.id}`} title="Edit"><Icon name="edit" size={15} /></a>
                          <a className="icon-btn" href={`/admin/catalog/gmp?id=${i.id}`} title="GMP & Listing"><Icon name="trending" size={15} /></a>
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
    </>
  );
}
