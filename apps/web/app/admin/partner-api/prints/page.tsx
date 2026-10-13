'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

const RANGE: [number, string][] = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']];
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
  const [detail, setDetail] = useState<api.PartnerPrintDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState<string | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  const openDetail = async (applicationRef: string) => {
    setDetailBusy(applicationRef); setDetailErr(null); setDetail(null);
    try { setDetail(await api.fetchPartnerPrintDetail(applicationRef)); }
    catch (e: any) { setDetailErr(String(e?.message ?? e)); }
    finally { setDetailBusy(null); }
  };

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
  const scopedName = data?.scoped ? (me.homeTenant?.name ?? '') : '';

  const doExport = async () => {
    setExporting(true); setErr(null);
    try { await api.exportPartnerApiPrintsCsv({ tenantId: tenantId || undefined, days }); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setExporting(false); }
  };

  const catClass = (c: string): string => {
    const k = c.toLowerCase();
    if (k.includes('retail')) return 'brand';
    if (k.includes('shareholder') || k.includes('employee')) return 'warn';
    return 'mut';
  };

  return (
    <div style={{ maxWidth: 1360 }}>
      <PageHead
        title="Partner API — Print report"
        sub="Applications printed via the API — applicant, bid and form number per row."
        actions={<button className="btn btn-secondary" disabled={exporting || !data?.rows.length} onClick={doExport}><Icon name="download" size={15} /> {exporting ? 'Exporting…' : 'Export CSV'}</button>}
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="tbl-toolbar">
        {data?.scoped ? (
          <span className="st lock" title="You’re viewing your own organisation’s data — scope is locked to your tenant.">
            <Icon name="lock" size={12} />
            <span className="st-key">Scope:</span> {scopedName || 'your organisation'}
          </span>
        ) : (
          data && (
            <select
              className="input"
              style={{ minWidth: 220, maxWidth: 260 }}
              value={tenantId}
              onChange={(e) => { setTenantId(e.target.value); setPage(1); }}
            >
              <option value="">All partners</option>
              {partners.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )
        )}
        <div className="seg" role="tablist" aria-label="Time range">
          {RANGE.map(([d, label]) => (
            <button
              key={d}
              type="button"
              className={days === d ? 'on' : ''}
              onClick={() => { setDays(d); setPage(1); }}
            >{label}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="t">
            Print-PDF forms{' '}
            {data && <span className="count-badge">{data.total.toLocaleString('en-IN')}</span>}
          </span>
        </div>

        {data === null ? <Loader /> : data.rows.length === 0 ? (
          <div className="card-pad muted" style={{ textAlign: 'center', padding: '28px 0' }}>No API-printed forms in this period.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr>
                <th>Date</th>
                <th>Partner</th>
                <th>IPO</th>
                <th>Applicant</th>
                <th>PAN</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Lots</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Form No</th>
                <th style={{ textAlign: 'right' }}></th>
              </tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.applicationRef}>
                    <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{new Date(r.at).toLocaleString('en-IN')}</td>
                    <td>{r.partner}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{r.ipoSymbol}</td>
                    <td>{r.applicant}</td>
                    <td className="mono">{r.pan}</td>
                    <td><span className={`st ${catClass(r.category)}`}>{r.category}</span></td>
                    <td className="mono" style={{ textAlign: 'right' }}>{r.lots}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{inr(r.amount)}</td>
                    <td className="mono">{r.formNo ?? '—'}</td>
                    <td style={{ textAlign: 'right', width: '1%', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="icon-btn"
                        title="View the request we received for this print"
                        disabled={detailBusy === r.applicationRef}
                        onClick={() => openDetail(r.applicationRef)}
                      >
                        <Icon name="eye" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="card-pad" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
            <span className="muted" style={{ fontSize: 13 }}>Page {page} / {pages}</span>
            <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        )}
      </div>

      {detailErr && (
        <Modal title="Couldn’t load detail" onClose={() => setDetailErr(null)}>
          <div className="banner warn">{detailErr}</div>
        </Modal>
      )}

      {detail && <PrintDetailModal detail={detail} isSuperAdmin={!!me.isSuperAdmin} onClose={() => setDetail(null)} />}
    </div>
  );
}

/** The request we received when this form was printed — sectioned into
 *  Applicant / Demat / Bank / Bid / Meta, PAN and bank account masked.
 *  Batch id + Application ref are shown to superadmin only (internal refs
 *  that aren't useful for tenant admins). No caveat note when the row
 *  carries an immutable snapshot — the data IS what we received. */
function PrintDetailModal({
  detail: d,
  isSuperAdmin,
  onClose,
}: { detail: api.PartnerPrintDetail; isSuperAdmin: boolean; onClose: () => void }) {
  return (
    <Modal
      wide
      title={`${d.ipoSymbol} · Form ${d.formNo ?? '—'}`}
      sub={`${d.fullName} · ${d.partner} · ${new Date(d.at).toLocaleString('en-IN')}`}
      onClose={onClose}
    >
      <div className="pd-grid">
        <PdSection title="Applicant">
          <PdRow k="Full name" v={d.fullName || '—'} />
          <PdRow k="PAN" v={d.pan || '—'} mono />
          <PdRow k="Mobile" v={d.mobile || '—'} mono />
          <PdRow k="Email" v={d.email || '—'} />
          <PdRow k="Address" v={[d.address, d.city, d.state].filter(Boolean).join(', ') || '—'} />
          <PdRow k="Pincode" v={d.pincode || '—'} mono />
        </PdSection>

        <PdSection title="Demat">
          <PdRow k="Depository" v={d.depository || '—'} />
          <PdRow k="DP ID" v={d.dpId || '—'} mono />
          <PdRow k="Client ID" v={d.clientId || '—'} mono />
        </PdSection>

        <PdSection title="Bank">
          <PdRow k="Account" v={d.bankAccount || '—'} mono />
          <PdRow k="Bank" v={d.bankName || '—'} />
          <PdRow k="Branch" v={d.branchName || '—'} />
        </PdSection>

        <PdSection title="Bid">
          <PdRow k="Category" v={<span className="st mut">{d.category || '—'}</span>} />
          <PdRow k="Lots" v={String(d.lots)} mono />
          <PdRow k="Share qty" v={d.shareQty != null ? d.shareQty.toLocaleString('en-IN') : '—'} mono />
          <PdRow k="Bid price" v={d.bidPrice != null ? `₹${d.bidPrice.toLocaleString('en-IN')}` : '—'} mono />
          <PdRow k="Amount" v={`₹${d.amount.toLocaleString('en-IN')}`} mono />
        </PdSection>

        <PdSection title="Meta">
          <PdRow k="Family group" v={d.familyGroup || '—'} />
          <PdRow k="Form no" v={d.formNo || '—'} mono />
          <PdRow k="Submitted" v={new Date(d.at).toLocaleString('en-IN')} />
          {isSuperAdmin && <PdRow k="Batch id" v={d.batchId || '—'} mono small />}
          {isSuperAdmin && <PdRow k="Application ref" v={d.applicationRef} mono small />}
        </PdSection>
      </div>
      {!d.snapshot && (
        <div className="banner" style={{ marginTop: 12, fontSize: 12, background: 'var(--brand-50)', color: 'var(--brand)' }}>
          Legacy print — applicant contact and bank details are read from the shared applicant profile (this print was
          created before per-request snapshots were captured). PAN and bank account are masked.
        </div>
      )}
    </Modal>
  );
}

function PdSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pd-sec">
      <h4>{title}</h4>
      <dl>{children}</dl>
    </div>
  );
}

function PdRow({ k, v, mono, small }: { k: string; v: React.ReactNode; mono?: boolean; small?: boolean }) {
  return (
    <>
      <dt>{k}</dt>
      <dd className={mono ? 'mono' : undefined} style={small ? { fontSize: 11.5, wordBreak: 'break-all' } : undefined}>{v}</dd>
    </>
  );
}
