'use client';
import { useCallback, useEffect, useState } from 'react';
import { can, useAdmin } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';
import * as api from '@/lib/tenants-admin';

const TYPE_LABEL: Record<string, string> = { platform: 'Operator', direct: 'Direct (B2C)', partner: 'Partner', branch: 'Branch' };
const RESULT_DONE = ['allotted', 'not_allotted', 'released', 'rejected', 'failed', 'draft'];
const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

export default function AdminApplications() {
  const s = useAdmin((x) => x);
  const [tree, setTree] = useState<api.AdminTenant[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [rows, setRows] = useState<api.AdminApplication[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadRows = useCallback(async (slug: string) => {
    try { setRows(await api.fetchApplications(slug)); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); setRows([]); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const t = await api.fetchTree();
        setTree(t);
        const first = t.find((x) => x.type !== 'platform') ?? t[0];
        if (first) { setSel(first.slug); await loadRows(first.slug); }
      } catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setLoading(false); }
    })();
  }, [loadRows]);

  const select = async (slug: string) => { setSel(slug); await loadRows(slug); };
  const allot = async (id: string) => {
    const lots = Number(draft[id]);
    if (!Number.isInteger(lots) || lots < 0) { setErr('Enter a whole number of allotted lots.'); return; }
    setBusy(true); setErr(null);
    try { await api.recordAllotment(id, lots); if (sel) await loadRows(sel); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  if (!can(s, 'bids.view')) return <NoAccess />;
  const canManage = can(s, 'bids.manage');

  const childrenOf = (pid: string | null) => tree.filter((t) => t.parentId === pid);
  const roots = tree.filter((t) => !t.parentId || !tree.some((x) => x.id === t.parentId));
  const renderNode = (t: api.AdminTenant, depth: number): React.ReactNode => (
    <div key={t.id}>
      <button onClick={() => select(t.slug)} style={{
        width: '100%', textAlign: 'left', padding: '9px 12px', paddingLeft: 12 + depth * 20, border: 'none',
        borderRadius: 10, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center',
        background: sel === t.slug ? 'var(--brand-50)' : 'transparent',
        boxShadow: sel === t.slug ? 'inset 0 0 0 1px var(--brand-200)' : 'none',
      }}>
        <span style={{ width: 8, height: 8, borderRadius: 3, background: t.brandColor ?? 'var(--border-2)' }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
        <span className="muted" style={{ fontSize: 12 }}>{TYPE_LABEL[t.type] ?? t.type}</span>
      </button>
      {childrenOf(t.id).map((c) => renderNode(c, depth + 1))}
    </div>
  );

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>Applications</h1><p className="muted">Bids across the tenant sub-tree — live. {canManage ? 'Record the registrar’s allotment inline.' : ''}</p></div>
      </div>
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      {loading ? <div className="muted">Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 20, alignItems: 'start' }}>
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Tenant</h3>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>{roots.map((r) => renderNode(r, 0))}</div>
          </div>

          <div className="panel">
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th>IPO</th><th>Applicant</th><th>Cat.</th><th>Lots</th><th>Amount</th><th>Status</th><th>Allotment</th></tr></thead>
                <tbody>
                  {rows.length === 0 ? <tr><td colSpan={7} className="muted" style={{ padding: 14 }}>No applications in this scope.</td></tr> :
                    (() => {
                      // Family/bulk batches share a batchId — count members for the badge.
                      const batchSize: Record<string, number> = {};
                      rows.forEach((r) => { if (r.batchId) batchSize[r.batchId] = (batchSize[r.batchId] ?? 0) + 1; });
                      return rows.map((a) => (
                      <tr key={a.id}>
                        <td className="mono" style={{ fontWeight: 600 }}>{a.ipoSymbol}</td>
                        <td>
                          {a.applicantName ?? '—'}
                          {a.batchId && batchSize[a.batchId] > 1 && (
                            <span className="pill" style={{ marginLeft: 8, fontSize: 10, background: 'var(--brand-50)', color: 'var(--brand-700)' }}
                              title={`Applied together as one family batch of ${batchSize[a.batchId]}`}>
                              family ×{batchSize[a.batchId]}
                            </span>
                          )}
                          <div className="muted mono" style={{ fontSize: 11 }}>{a.mobileMasked}</div>
                        </td>
                        <td className="muted">{a.applicantType}</td>
                        <td className="mono">{a.lots}</td>
                        <td className="mono">{inr(a.amount)}</td>
                        <td><span className="pill">{a.status.replace(/_/g, ' ')}</span></td>
                        <td>
                          {a.allottedLots != null ? (
                            <span className="mono">{a.allottedLots > 0 ? `${a.allottedLots} lot(s)` : 'none'}{a.refundAmount ? ` · ${inr(a.refundAmount)} refund` : ''}</span>
                          ) : canManage && !RESULT_DONE.includes(a.status) ? (
                            <span className="row" style={{ gap: 6 }}>
                              <input className="input mono" style={{ width: 56, padding: '4px 6px' }} placeholder="lots" value={draft[a.id] ?? ''}
                                onChange={(e) => setDraft({ ...draft, [a.id]: e.target.value.replace(/\D/g, '') })} />
                              <button className="btn btn-sm" disabled={busy} onClick={() => allot(a.id)}>Record</button>
                            </span>
                          ) : <span className="muted">—</span>}
                        </td>
                      </tr>
                      ));
                    })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
