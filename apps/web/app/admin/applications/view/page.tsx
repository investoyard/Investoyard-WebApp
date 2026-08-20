'use client';
import { useEffect, useMemo, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Tabs } from '@/components/ui/Tabs';
import { DL, Empty } from '@/components/ui/Detail';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

const inr = (n?: number | null) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN'));
const STATUS_CLS: Record<string, string> = { allotted: 'ok', not_allotted: 'mut', submitted: 'brand', pending: 'brand', draft: 'mut', failed: 'warn', rejected: 'warn', released: 'ok' };
// A short, human application reference from the record id.
const appRef = (id: string) => 'APP-' + id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();

function AppDetail() {
  const me = useOperator();
  const [id, setId] = useState<string | null>(null);
  const [rows, setRows] = useState<api.AdminApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setId(new URLSearchParams(window.location.search).get('id')); }, []);
  useEffect(() => {
    const slug = me?.homeTenant.slug;
    if (!slug) return;
    (async () => {
      try { setRows(await api.fetchApplications(slug)); }
      catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setLoading(false); }
    })();
  }, [me]);

  const a = useMemo(() => rows.find((r) => r.id === id) ?? null, [rows, id]);

  if (!operatorCan(me, 'bids.view')) return <NoAccess />;
  if (loading) return <Loader />;
  if (!a) return (
    <div style={{ maxWidth: 900 }}>
      <PageHead back={{ href: '/admin/applications', label: 'Applications' }} title="Application" />
      <div className="banner warn">{err ?? 'Application not found in your scope.'}</div>
    </div>
  );

  // Derived UPI-mandate state from the application status.
  const upiState = ['allotted', 'not_allotted', 'released', 'submitted'].includes(a.status) ? 'Success'
    : a.status === 'failed' || a.status === 'rejected' ? 'Failed'
    : a.status === 'draft' ? 'Not initiated' : 'Pending';
  const upiCls = upiState === 'Success' ? 'ok' : upiState === 'Failed' ? 'warn' : 'brand';

  const info = (
    <DL items={[
      ['IPO', <><span className="mono" style={{ fontWeight: 700 }}>{a.ipoSymbol}</span><div className="muted" style={{ fontSize: 12 }}>{a.ipoName}</div></>],
      ['Applicant', <>{a.applicantName ?? '—'}<div className="muted mono" style={{ fontSize: 12 }}>{a.mobileMasked}</div></>],
      ['Category', <span style={{ textTransform: 'uppercase' }}>{a.category}</span>],
      ['Applicant type', <span style={{ textTransform: 'capitalize' }}>{a.applicantType}</span>],
      ['Channel', <><span className="mono" style={{ fontWeight: 700 }}>{a.partnerCode ?? '—'}</span><div className="muted" style={{ fontSize: 12 }}>{a.tenantName ?? a.tenantSlug}</div></>],
      ['Lots', <span className="mono">{a.lots}</span>],
      ['Amount', <span className="mono">{inr(a.amount)}</span>],
      ['Commission', a.commissionAmount ? <span className="mono">{inr(a.commissionAmount)}{a.commissionRate ? <span className="muted"> · {a.commissionRate}%</span> : null}</span> : '—'],
      ['Applied on', <span className="mono">{a.appliedAt}</span>],
      ['Allotment', a.allottedLots != null ? <span className="mono">{a.allottedLots > 0 ? `${a.allottedLots} lot(s)` : 'None'}{a.refundAmount ? ` · ${inr(a.refundAmount)} refund` : ''}</span> : <span className="muted">Awaiting basis</span>],
      ...(a.allotmentReason ? [['Registrar reason', <span key="ar" style={{ fontSize: 13 }}>{a.allotmentReason}</span>] as [string, React.ReactNode]] : []),
    ]} />
  );

  const upi = (
    <DL items={[
      ['Mandate status', <span className={`st ${upiCls}`}>{upiState}</span>],
      ['Blocked amount', <span className="mono">{inr(a.amount)}</span>],
      ['Applicant mobile', <span className="mono">{a.mobileMasked ?? '—'}</span>],
      ['Note', <span className="muted">UPI id, mandate id &amp; approval time populate from the live payments feed.</span>],
    ]} />
  );

  const bid = (
    <DL items={[
      ['Rail status', <span className={`st ${STATUS_CLS[a.status] ?? 'mut'}`}>{a.status.replace(/_/g, ' ')}</span>],
      ['Category', <span style={{ textTransform: 'uppercase' }}>{a.category}</span>],
      ['Lots · Amount', <span className="mono">{a.lots} · {inr(a.amount)}</span>],
      ['Batch', a.batchId ? <span className="mono">{a.batchId.slice(-8)}</span> : <span className="muted">Single</span>],
      ['Note', <span className="muted">Exchange bid reference &amp; timestamps populate from Bidding &amp; Exchange.</span>],
    ]} />
  );

  const history = (
    <div className="timeline">
      <div className="tl-step done"><span className="tl-dot"><Icon name="check" size={13} /></span><div className="tl-body"><div className="tl-label">Application submitted</div><div className="tl-date mono">{a.appliedAt}</div></div></div>
      <div className={`tl-step ${a.allottedLots != null ? 'done' : 'next'}`}><span className="tl-dot"><Icon name={a.allottedLots != null ? 'check' : 'clock'} size={13} /></span><div className="tl-body"><div className="tl-label">Current status</div><div className="tl-date"><span className={`st ${STATUS_CLS[a.status] ?? 'mut'}`}>{a.status.replace(/_/g, ' ')}</span></div></div></div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1040 }}>
      <PageHead back={{ href: '/admin/applications', label: 'Applications' }} title={a.applicantName ?? a.ipoName}
        sub={`Application reference · ${appRef(a.id)}`}
        actions={<a className="btn btn-secondary" href="/admin/catalog"><Icon name="box" size={15} /> {a.ipoSymbol}</a>}
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="card detail-hero" style={{ marginBottom: 18 }}>
        <span className="dh-logo dh-logo-ph"><Icon name="list" size={22} /></span>
        <div className="dh-main">
          <div className="dh-title">{appRef(a.id)}</div>
          <div className="dh-sub">{a.ipoSymbol} · {a.applicantName ?? '—'}</div>
        </div>
        <div className="dh-stats">
          <div className="dh-stat"><span className="k">Status</span><span className={`st ${STATUS_CLS[a.status] ?? 'mut'}`}>{a.status.replace(/_/g, ' ')}</span></div>
          <div className="dh-stat"><span className="k">UPI</span><span className={`st ${upiCls}`}>{upiState}</span></div>
          <div className="dh-stat"><span className="k">Amount</span><span className="v mono">{inr(a.amount)}</span></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head" style={{ marginBottom: 16 }}><div className="t">Application information</div></div>
        {info}
      </div></div>

      <div className="card"><div className="card-pad">
        <Tabs tabs={[
          { key: 'upi', label: 'UPI Details', content: upi },
          { key: 'bid', label: 'Bid Details', content: bid },
          { key: 'history', label: 'Status History', content: history },
          { key: 'remarks', label: 'Remarks', content: <Empty icon="edit" title="No remarks" sub="Operator remarks on this application will show here." /> },
          { key: 'documents', label: 'Documents', content: <Empty icon="doc" title="No documents" sub="KYC / mandate documents attached to this application will show here." /> },
        ]} />
      </div></div>
    </div>
  );
}

export default function Page() { return <AppDetail />; }
