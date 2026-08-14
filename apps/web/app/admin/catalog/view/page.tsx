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
import { ipoPhase, priceBand } from '@/lib/format';
import * as api from '@/lib/tenants-admin';
import { cleanRich } from '@/lib/richClean';

const inr = (n?: number | null) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN'));
const STATUS_CLS: Record<string, string> = { allotted: 'ok', not_allotted: 'mut', submitted: 'brand', pending: 'brand', draft: 'mut', failed: 'warn', rejected: 'warn', released: 'ok' };

function IpoDetail() {
  const me = useOperator();
  const [id, setId] = useState<string | null>(null);
  const [ipo, setIpo] = useState<api.AdminIpoDetail | null>(null);
  const [apps, setApps] = useState<api.AdminApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setId(new URLSearchParams(window.location.search).get('id')); }, []);
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const d = await api.fetchIpo(id); setIpo(d);
        const slug = me?.homeTenant.slug;
        if (slug && operatorCan(me, 'bids.view')) { try { setApps(await api.fetchApplications(slug)); } catch { /* scope may 403 */ } }
      } catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setLoading(false); }
    })();
  }, [id, me]);

  const ipoApps = useMemo(() => (ipo ? apps.filter((a) => a.ipoSymbol === ipo.symbol) : []), [apps, ipo]);
  const agg = useMemo(() => {
    const byCat: Record<string, { count: number; lots: number; amount: number }> = {};
    const byStatus: Record<string, number> = {};
    let lots = 0, amount = 0;
    for (const a of ipoApps) {
      lots += a.lots; amount += a.amount;
      (byCat[a.category] ??= { count: 0, lots: 0, amount: 0 });
      byCat[a.category].count++; byCat[a.category].lots += a.lots; byCat[a.category].amount += a.amount;
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    }
    return { lots, amount, byCat, byStatus };
  }, [ipoApps]);

  if (!operatorCan(me, 'ipos.view')) return <NoAccess />;
  if (loading) return <Loader />;
  if (!ipo) return <div className="banner warn">{err ?? 'IPO not found.'}</div>;

  const ph = ipoPhase(ipo);
  const canManage = operatorCan(me, 'ipos.manage');

  const ex: Record<string, any> = ipo.extra ?? {};
  const day = (v?: string) => (v ? String(v).slice(0, 10) : undefined);
  const milestones: { label: string; date?: string }[] = [
    { label: 'Anchor', date: day(ex.anchorDate) },
    { label: 'Open', date: day(ex.openDate) || ipo.openDate }, { label: 'Close', date: day(ex.closeDate) || ipo.closeDate },
    { label: 'Allotment', date: ipo.allotmentDate }, { label: 'Refund', date: day(ex.refundDate) },
    { label: 'Demat credit', date: day(ex.dematDate) }, { label: 'Listing', date: ipo.listingDate },
  ];
  const today = new Date().toISOString().slice(0, 10);

  const overview = (
    <>
      <DL items={[
        ['Category', <span className={`chip ${ipo.type === 'sme' ? 'sme' : 'mainboard'}`} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999 }}>{ex.categoryName || (ipo.type === 'sme' ? 'SME' : 'Mainboard')}</span>],
        ['Issue type', ex.issueType || '—'],
        ['Status', <span className={`ph ${ph.phase}`}>{ph.label}</span>],
        ['Price band', priceBand(ipo.priceBandMin, ipo.priceBandMax)],
        ['Lot size', ipo.lotSize ?? '—'],
        ['Face value', ex.faceValue ? `₹${ex.faceValue}` : '—'],
        ['Issue size', ipo.issueSizeCr != null ? `₹${ipo.issueSizeCr} cr` : '—'],
        ['Retail discount', ex.retailDiscount ? `₹${ex.retailDiscount}` : '—'],
        ['Retail cut off', ex.retailCutOff ? `₹${ex.retailCutOff}` : '—'],
        ['GMP', ipo.gmp != null ? <span style={{ color: 'var(--pos)', fontWeight: 600 }}>+{ipo.gmp}</span> : '—'],
        ['Listing gain', ipo.listingGainPct != null ? `${ipo.listingGainPct}%` : '—'],
        ['Registrar', ipo.registrar],
        ['Lead managers', Array.isArray(ex.leads) && ex.leads.length ? ex.leads.join(', ') : '—'],
        ['IPO partner', Array.isArray(ex.partners) && ex.partners.length ? ex.partners.map((p: any) => p.member).join(', ') : '—'],
        ['ISIN', ipo.isin ? <span className="mono">{ipo.isin}</span> : '—'],
      ]} />
      {ipo.reservations && ipo.reservations.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="dl-label">Reserved quotas</div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>{ipo.reservations.map((r) => <span key={r} className="st brand" style={{ textTransform: 'capitalize' }}>{r}</span>)}</div>
        </div>
      )}
      {ipo.objectsOfIssue && (
        <div style={{ marginTop: 18 }}>
          <div className="dl-label">Objects of the issue</div>
          {/<[a-z][\s\S]*>/i.test(ipo.objectsOfIssue) ? (
            <div className="prose" style={{ fontSize: 14 }} dangerouslySetInnerHTML={{ __html: cleanRich(ipo.objectsOfIssue) }} />
          ) : (
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>{ipo.objectsOfIssue}</p>
          )}
        </div>
      )}
    </>
  );

  // Self-contained milestone cards (inline-styled — immune to shared-class CSS clashes).
  const dates = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
      {milestones.map((m) => {
        const state = !m.date ? 'tbd' : m.date < today ? 'done' : m.date === today ? 'now' : 'next';
        const clr = state === 'done' ? 'var(--brand)' : state === 'now' ? 'var(--good, #187a48)' : 'var(--text-faint)';
        const label = state === 'done' ? 'Completed' : state === 'now' ? 'Today' : state === 'next' ? 'Upcoming' : 'To be announced';
        return (
          <div key={m.label} style={{ border: `1px solid ${state === 'now' ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px', background: 'var(--surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: clr, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' }}>{m.label}</span>
            </div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>{m.date ?? 'TBD'}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: clr, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
          </div>
        );
      })}
    </div>
  );

  // Shares & Reservation (read-only view of the operator-entered tables)
  const SZ_LABELS: [string, string][] = [['qib', 'QIB'], ['hni', 'HNI'], ['retail', 'Retail'], ['employee', 'Employee'], ['shareholder', 'ShareHolder'], ['other', 'Other'], ['anchor', 'Anchor'], ['qibpost', 'QIB Post Anchor']];
  const RESV_LABELS: [string, string][] = [['qib', 'QIB'], ['hni', 'HNI (Big)'], ['hni2', 'HNI (Small)'], ['retail', 'Retail'], ['employee', 'Employee'], ['shareholder', 'ShareHolder'], ['other', 'Other']];
  const sz: Record<string, any> = ex.sharesSize ?? {};
  const resv: Record<string, any> = ex.shareResv ?? {};
  const hasSz = SZ_LABELS.some(([k]) => Object.values(sz[k] ?? {}).some((v: any) => String(v ?? '').trim() !== ''));
  const hasResv = RESV_LABELS.some(([k]) => resv[k]?.on);
  const sharesTab = (!hasSz && !hasResv) ? (
    <Empty icon="chart" title="No shares / reservation data" sub="Fill the Shares & Reservation tab in the Edit screen." />
  ) : (
    <>
      {hasSz && (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Category</th><th>Share</th><th>Min Price (Cr.)</th><th>Max Price (Cr.)</th><th>NCD Max</th><th>IND</th><th>HNI</th></tr></thead>
            <tbody>
              {SZ_LABELS.filter(([k]) => Object.values(sz[k] ?? {}).some((v: any) => String(v ?? '').trim() !== '')).map(([k, label]) => (
                <tr key={k}>
                  <td style={{ fontWeight: 600 }}>{label}</td>
                  <td className="mono">{sz[k]?.share || '—'}</td><td className="mono">{sz[k]?.minP || '—'}</td><td className="mono">{sz[k]?.maxP || '—'}</td>
                  <td className="mono">{sz[k]?.ncd || '—'}</td><td className="mono">{sz[k]?.ind || '—'}</td><td className="mono">{sz[k]?.hni || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasResv && (
        <div style={{ overflowX: 'auto', marginTop: hasSz ? 18 : 0 }}>
          <div className="dl-label" style={{ marginBottom: 8 }}>Share reservation</div>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Category</th><th>%</th><th>Share count</th><th>Req. for 1×</th><th>Remark</th></tr></thead>
            <tbody>
              {RESV_LABELS.filter(([k]) => resv[k]?.on).map(([k, label]) => (
                <tr key={k}>
                  <td style={{ fontWeight: 600 }}>{label}</td>
                  <td className="mono">{resv[k]?.pct || '—'}</td><td className="mono">{resv[k]?.count || '—'}</td>
                  <td className="mono">{resv[k]?.req1x || '—'}</td><td>{resv[k]?.remark || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  const ASBA_LABEL: Record<string, string> = {
    asba_form_resident: `ASBA Print Form — Resident (≤₹5L)${ex.asbaNames?.resident ? ` · ${ex.asbaNames.resident}` : ''}`,
    asba_form_syndicate: `ASBA Print Form — Syndicate (>₹5L)${ex.asbaNames?.syndicate ? ` · ${ex.asbaNames.syndicate}` : ''}`,
    asba_form_single: `ASBA Print Form${ex.asbaNames?.single ? ` · ${ex.asbaNames.single}` : ''}`,
    asba_form_shareholder: `ASBA Print Form — Shareholder (≤₹2L)${ex.asbaNames?.shareholder ? ` · ${ex.asbaNames.shareholder}` : ''}`,
  };
  const documents = (ipo.documents && ipo.documents.length) ? (
    <div className="doc-grid">
      {ipo.documents.map((d, i) => (
        <a className="doc-card" key={i} href={d.url} target="_blank" rel="noreferrer">
          <span className="dc-ic"><Icon name="doc" size={18} /></span>
          <div style={{ minWidth: 0 }}><div className="dc-t">{ASBA_LABEL[d.type] ?? d.type}</div><div className="dc-u mono">{d.url}</div></div>
          <Icon name="external" size={15} style={{ color: 'var(--text-faint)' }} />
        </a>
      ))}
    </div>
  ) : <Empty icon="doc" title="No documents linked" sub="Add RHP / DRHP / prospectus links from the Edit screen." />;

  const AppsTable = ({ rows }: { rows: api.AdminApplication[] }) => (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ width: '100%' }}>
        <thead><tr><th>Applicant</th><th>Channel</th><th>Cat.</th><th>Lots</th><th>Amount</th><th>Status</th><th>Applied</th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>{a.applicantName ?? '—'}<div className="muted mono" style={{ fontSize: 11 }}>{a.mobileMasked}</div></td>
              <td style={{ fontSize: 12 }}><span className="mono" style={{ fontWeight: 700 }}>{a.partnerCode ?? '—'}</span><div className="muted">{a.tenantName ?? a.tenantSlug}</div></td>
              <td className="muted" style={{ textTransform: 'uppercase', fontSize: 12 }}>{a.applicantType}</td>
              <td className="mono">{a.lots}</td>
              <td className="mono">{inr(a.amount)}</td>
              <td><span className={`st ${STATUS_CLS[a.status] ?? 'mut'}`}>{a.status.replace(/_/g, ' ')}</span></td>
              <td className="mono muted" style={{ fontSize: 12 }}>{a.appliedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const subscription = ipoApps.length ? (
    <>
      <div className="stat-strip">
        <div className="ss-item"><span className="ss-k">Applications</span><span className="ss-v">{ipoApps.length}</span></div>
        <div className="ss-item"><span className="ss-k">Lots applied</span><span className="ss-v">{agg.lots}</span></div>
        <div className="ss-item"><span className="ss-k">Amount</span><span className="ss-v">{inr(agg.amount)}</span></div>
        <div className="ss-item"><span className="ss-k">Categories</span><span className="ss-v">{Object.keys(agg.byCat).length}</span></div>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table className="table" style={{ width: '100%' }}>
          <thead><tr><th>Category</th><th>Applications</th><th>Lots</th><th>Amount</th></tr></thead>
          <tbody>
            {Object.entries(agg.byCat).map(([c, v]) => (
              <tr key={c}><td style={{ textTransform: 'uppercase' }}>{c}</td><td className="mono">{v.count}</td><td className="mono">{v.lots}</td><td className="mono">{inr(v.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>Aggregated from applications booked on this platform. Official “times subscribed” comes from the exchange/registrar feed (Bidding &amp; Exchange).</p>
    </>
  ) : <Empty icon="chart" title="No subscription yet" sub="Applications booked for this IPO will aggregate here." />;

  const bids = ipoApps.length ? (
    <>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        {Object.entries(agg.byStatus).map(([s, n]) => (
          <span key={s} className={`st ${STATUS_CLS[s] ?? 'mut'}`}>{s.replace(/_/g, ' ')} · {n}</span>
        ))}
      </div>
      <AppsTable rows={ipoApps} />
    </>
  ) : <Empty icon="exchange" title="No bids on the rail" sub="Bids submitted to NSE / BSE for this IPO will appear here." />;

  const applications = ipoApps.length ? <AppsTable rows={ipoApps} /> : <Empty icon="list" title="No applications" sub="Investor applications for this IPO will list here." />;

  const activity = (
    <div className="timeline">
      {[
        { label: 'Listed on the catalog', date: undefined as string | undefined, note: `${ipo.symbol} · ${ipo.name}` },
        { label: 'Bidding opens', date: ipo.openDate },
        { label: 'Bidding closes', date: ipo.closeDate },
        { label: 'Basis of allotment', date: ipo.allotmentDate },
        { label: 'Lists on exchange', date: ipo.listingDate },
      ].map((e, i) => {
        const state = !e.date ? 'done' : e.date < today ? 'done' : e.date === today ? 'now' : 'next';
        return (
          <div className={`tl-step ${state}`} key={i}>
            <span className="tl-dot"><Icon name={state === 'next' ? 'clock' : 'check'} size={13} /></span>
            <div className="tl-body"><div className="tl-label">{e.label}</div><div className="tl-date mono">{e.date ?? e.note ?? ''}</div></div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ maxWidth: 1180 }}>
      <PageHead back={{ href: '/admin/catalog', label: 'IPO List' }} title={ipo.name}
        sub={`${ipo.symbol} · ${(ipo.extra as any)?.categoryName || (ipo.type === 'sme' ? 'SME' : 'Mainboard')}`}
        actions={
          <>
            <a className="btn btn-secondary" href={`/ipos/${ipo.symbol}`} target="_blank" rel="noreferrer"><Icon name="external" size={15} /> View on site</a>
            {canManage && <a className="btn" href={`/admin/catalog/edit?id=${ipo.id}`}><Icon name="edit" size={15} /> Edit</a>}
          </>
        }
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="card detail-hero" style={{ marginBottom: 18 }}>
        {ipo.logoUrl ? <img src={ipo.logoUrl} alt="" className="dh-logo" /> : <span className="dh-logo dh-logo-ph"><Icon name="box" size={24} /></span>}
        <div className="dh-main">
          <div className="dh-title">{ipo.name}</div>
          <div className="dh-sub"><span className="mono" style={{ fontWeight: 700 }}>{ipo.symbol}</span> · {ex.categoryName || (ipo.type === 'sme' ? 'SME' : 'Mainboard')}</div>
        </div>
        <div className="dh-stats">
          <div className="dh-stat"><span className="k">Price band</span><span className="v mono">{priceBand(ipo.priceBandMin, ipo.priceBandMax)}</span></div>
          <div className="dh-stat"><span className="k">Lot</span><span className="v mono">{ipo.lotSize ?? '—'}</span></div>
          <div className="dh-stat"><span className="k">GMP</span><span className="v mono" style={ipo.gmp != null ? { color: 'var(--pos)' } : undefined}>{ipo.gmp != null ? `+${ipo.gmp}` : '—'}</span></div>
          <div className="dh-stat"><span className="k">Status</span><span className={`ph ${ph.phase}`}>{ph.label}</span></div>
        </div>
      </div>

      <div className="card"><div className="card-pad">
        <Tabs tabs={[
          { key: 'overview', label: 'Overview', content: overview },
          { key: 'shares', label: 'Shares & Reservation', content: sharesTab },
          { key: 'dates', label: 'Dates', content: dates },
          { key: 'documents', label: 'Documents', count: ipo.documents?.length ?? 0, content: documents },
          { key: 'subscription', label: 'Subscription', content: subscription },
          { key: 'bids', label: 'Bids', count: ipoApps.length, content: bids },
          { key: 'applications', label: 'Applications', count: ipoApps.length, content: applications },
          { key: 'activity', label: 'Activity', content: activity },
        ]} />
      </div></div>
    </div>
  );
}

export default function Page() { return <IpoDetail />; }
