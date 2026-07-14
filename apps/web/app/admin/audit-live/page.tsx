'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from "@/lib/operator-context";
import { operatorCan } from "@/lib/operator";
import { NoAccess } from '@/components/AdminUI';
import * as api from '@/lib/tenants-admin';

const ACTION_LABEL: Record<string, string> = {
  'role.create': 'Created role', 'role.update': 'Updated role', 'role.delete': 'Deleted role',
  'member.add': 'Added operator', 'member.update': 'Updated operator',
  'ipo.create': 'Created IPO', 'ipo.update': 'Updated IPO',
  'setting.set': 'Set feature', 'setting.clear': 'Cleared feature',
  'allotment.record': 'Recorded allotment',
};
const TONE: Record<string, string> = { create: '#1a7f4b', add: '#1a7f4b', update: 'var(--brand)', set: 'var(--brand)', delete: 'var(--danger, #c0392b)', clear: 'var(--danger, #c0392b)', record: 'var(--brand)' };
const maskMobile = (m?: string) => (m ? m.slice(0, 2) + '****' + m.slice(-4) : 'system');

export default function AdminAuditLive() {
  const me = useOperator();
  const [rows, setRows] = useState<api.AuditEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await api.fetchAudit()); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!operatorCan(me, 'audit.view')) return <NoAccess />;

  const when = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>Audit log</h1><p className="muted">Operator mutations across the platform — live.</p></div>
        <button className="btn btn-secondary btn-sm" onClick={load}>Refresh</button>
      </div>
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      <div className="panel">
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Tenant</th></tr></thead>
            <tbody>
              {rows === null ? <tr><td colSpan={5} className="muted" style={{ padding: 14 }}>Loading…</td></tr> :
                rows.length === 0 ? <tr><td colSpan={5} className="muted" style={{ padding: 14 }}>No activity recorded yet.</td></tr> :
                  rows.map((r) => {
                    const verb = r.action.split('.')[1] ?? '';
                    return (
                      <tr key={r.id}>
                        <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(r.at)}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{maskMobile(r.actorMobile)}</td>
                        <td><span style={{ fontWeight: 600, color: TONE[verb] ?? 'var(--text)' }}>{ACTION_LABEL[r.action] ?? r.action}</span></td>
                        <td>{r.targetLabel ?? r.targetType ?? '—'}{r.targetType && r.targetLabel ? <span className="muted" style={{ fontSize: 12 }}> · {r.targetType}</span> : null}</td>
                        <td className="muted">{r.tenantSlug ?? '—'}</td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
