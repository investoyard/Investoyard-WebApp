'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;

/** Print-PDF-by-API report — applications created through the partner API, with CSV export. */
export default function PartnerApiPrintsPage() {
  const me = useOperator();
  const [data, setData] = useState<api.PartnerReport<api.PartnerPrintRow> | null>(null);
  const [tenants, setTenants] = useState<api.PartnerRow[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.fetchPartnerApiPrints({ tenantId: tenantId || undefined, days, page })
      .then((d) => { setData(d); setErr(null); })
      .catch((e) => setErr(String(e?.message ?? e)));
  }, [tenantId, days, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.fetchTenants().then(setTenants).catch(() => {}); }, []);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'reports.view')) return <NoAccess />;

  const partners = tenants;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;

  const doExport = async () => {
    setExporting(true); setErr(null);
    try { await api.exportPartnerApiPrintsCsv({ tenantId: tenantId || undefined, days }); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setExporting(false); }
  };

  return (
    <div style={{ maxWidth: 1360 }}>
      <PageHead
        title="Partner API — Print report"
        sub="Applications printed via the API — applicant, bid and form number per row."
        actions={<button className="btn btn-secondary" disabled={exporting || !data?.rows.length} onClick={doExport}><Icon name="download" size={15} /> {exporting ? 'Exporting…' : 'Export CSV'}</button>}
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="row" style={{ gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {data && !data.scoped && (
          <select className="input" style={{ maxWidth: 260 }} value={tenantId} onChange={(e) => { setTenantId(e.target.value); setPage(1); }}>
            <option value="">All partners</option>
            {partners.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <select className="input" style={{ maxWidth: 160 }} value={days} onChange={(e) => { setDays(Number(e.target.value)); setPage(1); }}>
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
        {data && <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>{data.total.toLocaleString('en-IN')} forms</span>}
      </div>

      {data === null ? <Loader /> : (
        <div className="card"><div className="card-pad">
          {data.rows.length === 0 ? (
            <div className="muted" style={{ padding: '18px 0', textAlign: 'center' }}>No API-printed forms in this period.</div>
          ) : (
            <table className="table">
              <thead><tr><th>Date</th><th>Partner</th><th>IPO</th><th>Applicant</th><th>PAN</th><th>Category</th><th>Lots</th><th>Amount</th><th>Form No</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.applicationRef}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString('en-IN')}</td>
                    <td>{r.partner}</td>
                    <td className="mono">{r.ipoSymbol}</td>
                    <td>{r.applicant}</td>
                    <td className="mono">{r.pan}</td>
                    <td>{r.category}</td>
                    <td className="mono">{r.lots}</td>
                    <td className="mono">{inr(r.amount)}</td>
                    <td className="mono">{r.formNo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {pages > 1 && (
            <div className="row" style={{ gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
              <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>Page {page} / {pages}</span>
              <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
          )}
        </div></div>
      )}
    </div>
  );
}
