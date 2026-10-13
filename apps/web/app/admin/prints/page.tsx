'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, SearchBox } from '@/components/ui/Form';
import { PartnerBranchFilter } from '@/components/admin/Filters';
import { usePagination } from '@/components/ui/Pagination';
import { useSort } from '@/components/ui/useSort';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

/**
 * Print Forms Report — every ASBA PDF the operator generated for a consumer
 * through the web or mobile app. Partner-API prints are excluded (they have
 * their own report under Partner API → Print Report — the two channels
 * have different downstream flows).
 *
 * These rows are NOT bids to any exchange — the form was printed for the
 * applicant to sign and hand in at their bank. Kept here as an audit
 * trail: who printed, for whom, which IPO, when, and what form number
 * was allocated from the IPO's PDF series.
 */
const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export default function AdminPrints() {
  const me = useOperator();
  const homeSlug = me?.homeTenant.slug ?? '';
  const [tree, setTree] = useState<api.AdminTenant[]>([]);
  const [scope, setScope] = useState(homeSlug);
  const [rows, setRows] = useState<api.ConsumerPrintRow[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRows = useCallback(async (slug: string) => {
    try { setRows(await api.fetchConsumerPrints(slug)); setErr(null); }
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      r.ipoSymbol?.toLowerCase().includes(needle)
      || r.ipoName?.toLowerCase().includes(needle)
      || r.applicantName?.toLowerCase().includes(needle)
      || r.familyGroup?.toLowerCase().includes(needle)
      || r.formNo?.includes(needle));
  }, [rows, q]);

  const { apply, Th } = useSort<api.ConsumerPrintRow>((r, k) => {
    switch (k) {
      case 'ipo': return r.ipoSymbol ?? '';
      case 'applicant': return (r.applicantName ?? '').toLowerCase();
      case 'lots': return r.lots;
      case 'amount': return r.amount;
      case 'form': return r.formNo ?? '';
      case 'printed': return r.printedAt;
      default: return '';
    }
  });
  const { slice, node: pager } = usePagination(apply(filtered), 25);

  const totalAmount = useMemo(() => filtered.reduce((s, r) => s + r.amount, 0), [filtered]);

  const toCsv = (): string => {
    const head = ['Printed', 'IPO', 'Applicant', 'Family group', 'Category', 'Lots', 'Shares', 'Amount', 'Form #', 'Channel', 'Partner code'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.join(',')];
    for (const r of filtered) lines.push([
      r.printedAt, r.ipoSymbol, r.applicantName ?? '', r.familyGroup ?? '', r.category,
      r.lots, r.shareQty ?? '', r.amount, r.formNo ?? '', r.tenantName ?? '', r.partnerCode ?? '',
    ].map(esc).join(','));
    return lines.join('\n');
  };

  if (!operatorCan(me, 'bids.view')) return <NoAccess />;

  return (
    <>
      <PageHead
        title="Print Forms Report"
        sub="ASBA forms printed from web / mobile for consumer applicants. Not bids — these are unsigned forms handed to the bank. Partner-API prints have their own report under Partner API → Print Report."
        actions={<button className="btn btn-secondary" disabled={!filtered.length} onClick={() => downloadCsv(`investoyard-prints-${new Date().toISOString().slice(0, 10)}.csv`, toCsv())}>↓ Export CSV</button>}
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="filter-row">
        <PartnerBranchFilter tree={tree} homeSlug={scope} onScope={onScope} />
        <SearchBox value={q} onChange={setQ} placeholder="Search IPO / applicant / form no…" />
        <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>
          <b>{filtered.length}</b> print{filtered.length === 1 ? '' : 's'} · total {inr(totalAmount)}
        </div>
      </div>

      {loading ? <Loader /> : (
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr>
                <Th k="printed" label="Printed" />
                <Th k="ipo" label="IPO" />
                <Th k="applicant" label="Applicant" />
                <th>Family group</th>
                <th>Category</th>
                <Th k="lots" label="Lots" right />
                <Th k="amount" label="Amount" right />
                <Th k="form" label="Form #" />
                <th>Channel</th>
              </tr></thead>
              <tbody>
                {slice.length === 0 ? (
                  <tr><td colSpan={9} className="muted" style={{ padding: 14 }}>
                    {q ? 'No matches.' : 'No consumer prints yet on this scope.'}
                  </td></tr>
                ) : slice.map((r) => (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{r.printedAt}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span className="mono" style={{ fontWeight: 700 }}>{r.ipoSymbol}</span>
                      <div className="muted" style={{ fontSize: 11.5 }}>{r.ipoName}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {r.applicantName ?? <span className="muted">—</span>}
                      {r.accountHolder && r.accountHolder !== r.applicantName && (
                        <div className="muted" style={{ fontSize: 11.5 }}>Account: {r.accountHolder}</div>
                      )}
                      {r.mobileMasked && <div className="mono muted" style={{ fontSize: 11 }}>{r.mobileMasked}</div>}
                    </td>
                    <td>{r.familyGroup ?? <span className="muted">—</span>}</td>
                    <td><span className="mst-badge">{r.category}</span></td>
                    <td className="r mono">{r.lots}</td>
                    <td className="r mono">{inr(r.amount)}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{r.formNo ?? <span className="muted">—</span>}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>
                      {r.tenantName ?? <span className="muted">—</span>}
                      {r.partnerCode && <div className="muted mono" style={{ fontSize: 11 }}>{r.partnerCode}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && pager}
        </div>
      )}
    </>
  );
}
