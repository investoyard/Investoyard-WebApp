'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { Loader } from '@/components/ui/Loader';
import { PageHead, Panel, Field, Toggle } from '@/components/ui/Form';
import { RichText } from '@/components/ui/RichText';
import { Icon } from '@/components/Icon';
import { ipoPhase } from '@/lib/format';
import * as api from '@/lib/tenants-admin';

type IconName = Parameters<typeof Icon>[0]['name'];
const DOC_TYPES = ['RHP', 'DRHP', 'Prospectus', 'Anchor allocation', 'Financials', 'Other'] as const;
const ISSUE_TYPES = ['IPO', 'FPO', 'Rights Issue', 'OFS'] as const;
const TABS: { key: string; label: string; icon: IconName }[] = [
  { key: 'basic', label: 'Basic Details', icon: 'box' },
  { key: 'shares', label: 'Shares & Reservation', icon: 'chart' },
  { key: 'company', label: 'About Company', icon: 'globe' },
  { key: 'docs', label: 'Documents', icon: 'doc' },
  { key: 'series', label: 'Application Series', icon: 'list' },
];
// Shares Size Info rows
const SZ_CATS = ['qib', 'hni', 'retail', 'employee', 'shareholder', 'other'];
const SZ_ROWS: { key: string; label: string; extra?: boolean }[] = [
  { key: 'qib', label: 'QIB' }, { key: 'hni', label: 'HNI', extra: true }, { key: 'retail', label: 'Retail', extra: true },
  { key: 'employee', label: 'Employee' }, { key: 'shareholder', label: 'ShareHolder' }, { key: 'other', label: 'Other' },
];
const SZ_TAIL: { key: string; label: string }[] = [{ key: 'anchor', label: 'Anchor' }, { key: 'qibpost', label: 'QIB Post Anchor' }];
// Share Reservation rows — HNI (Big) and HNI (Small) grouped together
const RESV_ROWS: { key: string; label: string }[] = [
  { key: 'qib', label: 'QIB' }, { key: 'hni', label: 'HNI (Big)' }, { key: 'hni2', label: 'HNI (Small)' },
  { key: 'retail', label: 'Retail' }, { key: 'employee', label: 'Employee' }, { key: 'shareholder', label: 'ShareHolder' }, { key: 'other', label: 'Other' },
];

type Doc = { type: string; name: string; url: string };
type Partner = { member: string; exchange: string };
type Series = { member: string; from: string; to: string; active: boolean; exchange?: string };
type SzCell = { share: string; minP: string; maxP: string; ncd: string; ind: string; hni: string };
type Resv = { on: boolean; pct: string; count: string; remark: string; req1x: string };
const blankSz = (): SzCell => ({ share: '', minP: '', maxP: '', ncd: '', ind: '', hni: '' });
const blankShares = (): Record<string, SzCell> => Object.fromEntries([...SZ_CATS, 'anchor', 'qibpost'].map((k) => [k, blankSz()]));
const blankResv = (): Resv => ({ on: false, pct: '', count: '', remark: '', req1x: '' });
const blankShareResv = (): Record<string, Resv> => Object.fromEntries(RESV_ROWS.map((r) => [r.key, blankResv()]));
interface FormState {
  symbol: string; name: string; type: string; issueType: string; status: string; faceValue: string; lotSize: string; isin: string;
  autoPollSubscription: boolean;
  allowShareholder: boolean; allowEmployee: boolean; // reserved quotas this issue offers
  categoryName: string; // IPO Category master name (drives type via its platform mapping)
  priceBandMin: string; priceBandMax: string;
  retailDiscount: string; retailCutOff: string; ncdMaxSeries: string; maxAmtRetail: string; noOfApp: string;
  bseListingPrice: string; nseListingPrice: string;
  registrar: string; registrarEmail: string; registrarPhone: string; registrarUrl: string;
  logoUrl: string; companyWebsite: string; companyPromoter: string;
  companyDescription: string; companyStrength: string; companyFinancials: string; contactInfo: string; objectsOfIssue: string;
  faqs: { q: string; a: string }[];
  anchorDate: string; refundDate: string;
  openDate: string; closeDate: string; qibCloseDate: string; allotmentDate: string; dematDate: string; listingDate: string;
  documents: Doc[]; leads: string[]; partners: Partner[]; pdfSeries: Series[]; onlineSeries: Series[];
  sharesSize: Record<string, SzCell>; shareResv: Record<string, Resv>; resvRemarks: string; resvRemarks2: string;
  asbaResident: string; asbaSyndicate: string; asbaSingle: string; // blank ASBA form PDFs (URLs) for prefill printing
  asbaResidentName: string; asbaSyndicateName: string; asbaSingleName: string; // original file names (display)
}
const blankForm = (): FormState => ({
  symbol: '', name: '', type: 'mainboard', issueType: 'IPO', status: 'upcoming', faceValue: '', lotSize: '', isin: '',
  autoPollSubscription: true,
  allowShareholder: false, allowEmployee: false,
  categoryName: '',
  priceBandMin: '', priceBandMax: '',
  retailDiscount: '', retailCutOff: '', ncdMaxSeries: '', maxAmtRetail: '', noOfApp: '',
  bseListingPrice: '', nseListingPrice: '',
  registrar: '', registrarEmail: '', registrarPhone: '', registrarUrl: '',
  logoUrl: '', companyWebsite: '', companyPromoter: '',
  companyDescription: '', companyStrength: '', companyFinancials: '', contactInfo: '', objectsOfIssue: '',
  faqs: [],
  anchorDate: '', refundDate: '',
  openDate: '', closeDate: '', qibCloseDate: '', allotmentDate: '', dematDate: '', listingDate: '',
  documents: [], leads: [], partners: [], pdfSeries: [], onlineSeries: [],
  sharesSize: blankShares(), shareResv: blankShareResv(), resvRemarks: '', resvRemarks2: '',
  asbaResident: '', asbaSyndicate: '', asbaSingle: '',
  asbaResidentName: '', asbaSyndicateName: '', asbaSingleName: '',
});
const ASBA_TYPES = ['asba_form_resident', 'asba_form_syndicate', 'asba_form_single'];
const str = (v: any) => (v == null ? '' : String(v));
const toDT = (v: any) => { const s = v == null ? '' : String(v); return s.length === 10 ? s + 'T00:00' : s; };

export function IpoForm({ ipoId }: { ipoId?: string }) {
  const me = useOperator();
  const router = useRouter();
  const editing = !!ipoId;
  const [form, setForm] = useState<FormState>(blankForm());
  const initial = useRef<FormState>(blankForm());
  const [tab, setTab] = useState('basic');
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docBusy, setDocBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ipoId) { initial.current = blankForm(); return; }
    (async () => {
      try {
        const d = await api.fetchIpo(ipoId);
        const ex: Record<string, any> = d.extra ?? {};
        const loaded: FormState = {
          ...blankForm(),
          symbol: d.symbol, name: d.name, type: d.type, status: d.status, isin: str(d.isin),
          autoPollSubscription: d.autoPollSubscription !== false,
          allowShareholder: (d.reservations ?? []).includes('shareholder'),
          allowEmployee: (d.reservations ?? []).includes('employee'),
          priceBandMin: str(d.priceBandMin), priceBandMax: str(d.priceBandMax), lotSize: str(d.lotSize),
          registrar: str(d.registrar), logoUrl: str(d.logoUrl), objectsOfIssue: str(d.objectsOfIssue),
          openDate: str(ex.openDate) || toDT(d.openDate), closeDate: str(ex.closeDate) || toDT(d.closeDate), allotmentDate: str(d.allotmentDate), listingDate: str(d.listingDate),
          documents: (d.documents ?? []).filter((x) => !ASBA_TYPES.includes(x.type)).map((x) => ({ type: x.type, name: x.type, url: x.url })),
          asbaResident: str((d.documents ?? []).find((x) => x.type === 'asba_form_resident')?.url),
          asbaSyndicate: str((d.documents ?? []).find((x) => x.type === 'asba_form_syndicate')?.url),
          asbaSingle: str((d.documents ?? []).find((x) => x.type === 'asba_form_single')?.url),
          asbaResidentName: str(ex.asbaNames?.resident), asbaSyndicateName: str(ex.asbaNames?.syndicate), asbaSingleName: str(ex.asbaNames?.single),
          // ---- extended fields (from extra JSON) ----
          issueType: ex.issueType ?? 'IPO', faceValue: str(ex.faceValue), categoryName: str(ex.categoryName),
          retailDiscount: str(ex.retailDiscount), retailCutOff: str(ex.retailCutOff), ncdMaxSeries: str(ex.ncdMaxSeries), maxAmtRetail: str(ex.maxAmtRetail), noOfApp: str(ex.noOfApp),
          bseListingPrice: str(ex.bseListingPrice), nseListingPrice: str(ex.nseListingPrice),
          qibCloseDate: str(ex.qibCloseDate), dematDate: str(ex.dematDate),
          anchorDate: str(ex.anchorDate), refundDate: str(ex.refundDate),
          registrarEmail: str(ex.registrarEmail), registrarPhone: str(ex.registrarPhone), registrarUrl: str(ex.registrarUrl),
          companyWebsite: str(ex.companyWebsite), companyPromoter: str(ex.companyPromoter),
          companyDescription: str(ex.companyDescription), companyStrength: str(ex.companyStrength), companyFinancials: str(ex.companyFinancials), contactInfo: str(ex.contactInfo),
          faqs: Array.isArray(ex.faqs) ? ex.faqs : [], leads: Array.isArray(ex.leads) ? ex.leads : [], partners: Array.isArray(ex.partners) ? ex.partners : [],
          pdfSeries: Array.isArray(ex.pdfSeries) ? ex.pdfSeries : [], onlineSeries: Array.isArray(ex.onlineSeries) ? ex.onlineSeries : [],
          sharesSize: ex.sharesSize ?? blankShares(),
          shareResv: ex.shareResv ?? (() => { const sr = blankShareResv(); (d.reservations ?? []).forEach((k) => { if (sr[k]) sr[k].on = true; }); return sr; })(),
          resvRemarks: str(ex.resvRemarks), resvRemarks2: str(ex.resvRemarks2),
        };
        initial.current = loaded; setForm(loaded);
      } catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setLoading(false); }
    })();
  }, [ipoId]);

  const set = (part: Partial<FormState>) => setForm((f) => ({ ...f, ...part }));

  const [subMsg, setSubMsg] = useState<string | null>(null);
  const refreshSub = async () => {
    if (!ipoId) return;
    setSubMsg('refreshing…');
    try {
      const r = await api.pollSubscriptionIpo(ipoId);
      setSubMsg(r.reason === 'no-credential' ? 'No active NSE credential.' : r.ok ? (r.changed ? 'Updated ✓' : 'Checked — no change') : `Failed: ${r.reason ?? ''}`);
    } catch (e: any) { setSubMsg(String(e?.message ?? e)); }
  };
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const isActive = form.status !== 'withdrawn';
  const setDoc = (i: number, part: Partial<Doc>) => set({ documents: form.documents.map((d, x) => (x === i ? { ...d, ...part } : d)) });
  const setPartner = (i: number, part: Partial<Partner>) => set({ partners: form.partners.map((d, x) => (x === i ? { ...d, ...part } : d)) });
  const setFaq = (i: number, part: Partial<{ q: string; a: string }>) => set({ faqs: form.faqs.map((f, x) => (x === i ? { ...f, ...part } : f)) });
  const setSz = (key: string, part: Partial<SzCell>) => set({ sharesSize: { ...form.sharesSize, [key]: { ...form.sharesSize[key], ...part } } });
  const setResv = (key: string, part: Partial<Resv>) => set({ shareResv: { ...form.shareResv, [key]: { ...form.shareResv[key], ...part } } });
  const szSum = (field: keyof SzCell) => SZ_CATS.reduce((a, k) => a + (Number(form.sharesSize[k]?.[field]) || 0), 0);
  const setSeries = (key: 'pdfSeries' | 'onlineSeries', i: number, part: Partial<Series>) => set({ [key]: form[key].map((s, x) => (x === i ? { ...s, ...part } : s)) } as Partial<FormState>);
  const activate = (key: 'pdfSeries' | 'onlineSeries', i: number) => set({ [key]: form[key].map((s, x) => ({ ...s, active: x === i })) } as Partial<FormState>);
  const addSeries = (key: 'pdfSeries' | 'onlineSeries') => set({ [key]: [...form[key], { member: form.partners[0]?.member ?? '', from: '', to: '', active: form[key].length === 0, ...(key === 'onlineSeries' ? { exchange: 'NSE' } : {}) }] } as Partial<FormState>);

  const onLogo = async (file?: File) => {
    if (!file) return;
    setUploading(true); setErr(null);
    try { set({ logoUrl: await api.uploadImage(file) }); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const onDocFile = async (i: number, file?: File) => {
    if (!file) return;
    setDocBusy(i); setErr(null);
    try { const r = await api.uploadDoc(file); setDoc(i, { name: r.name, url: r.url }); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setDocBusy(null); }
  };

  const [asbaBusy, setAsbaBusy] = useState<string | null>(null);
  const onAsbaFile = async (slot: 'asbaResident' | 'asbaSyndicate' | 'asbaSingle', file?: File | null) => {
    if (!file) return;
    setAsbaBusy(slot); setErr(null);
    try { const r = await api.uploadPdf(file); set({ [slot]: r.url, [slot + 'Name']: r.name } as Partial<FormState>); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setAsbaBusy(null); }
  };

  const payload = (): api.IpoWrite => ({
    name: form.name, type: form.type, status: form.status,
    priceBandMin: num(form.priceBandMin), priceBandMax: num(form.priceBandMax), lotSize: num(form.lotSize),
    issueSizeCr: szSum('maxP') > 0 ? szSum('maxP') : undefined,
    registrar: form.registrar || undefined, isin: form.isin || undefined, logoUrl: form.logoUrl || undefined,
    objectsOfIssue: form.objectsOfIssue || undefined,
    openDate: form.openDate ? form.openDate.slice(0, 10) : undefined, closeDate: form.closeDate ? form.closeDate.slice(0, 10) : undefined,
    allotmentDate: form.allotmentDate || undefined, listingDate: form.listingDate || undefined,
    reservations: [...(form.allowShareholder ? ['shareholder'] : []), ...(form.allowEmployee ? ['employee'] : [])],
    documents: [
      ...form.documents.filter((d) => d.url.trim() && !ASBA_TYPES.includes(d.type)).map((d) => ({ type: d.type, url: d.url.trim() })),
      ...(form.asbaResident ? [{ type: 'asba_form_resident', url: form.asbaResident }] : []),
      ...(form.asbaSyndicate ? [{ type: 'asba_form_syndicate', url: form.asbaSyndicate }] : []),
      ...(form.asbaSingle ? [{ type: 'asba_form_single', url: form.asbaSingle }] : []),
    ],
    autoPollSubscription: form.autoPollSubscription,
    extra: {
      issueType: form.issueType, faceValue: form.faceValue, categoryName: form.categoryName,
      retailDiscount: form.retailDiscount, retailCutOff: retailCutOffCalc, ncdMaxSeries: form.ncdMaxSeries, maxAmtRetail: form.maxAmtRetail, noOfApp: form.noOfApp,
      anchorDate: form.anchorDate, refundDate: form.refundDate,
      bseListingPrice: form.bseListingPrice, nseListingPrice: form.nseListingPrice,
      openDate: form.openDate, closeDate: form.closeDate, qibCloseDate: form.qibCloseDate, dematDate: form.dematDate,
      registrarEmail: form.registrarEmail, registrarPhone: form.registrarPhone, registrarUrl: form.registrarUrl,
      companyWebsite: form.companyWebsite, companyPromoter: form.companyPromoter,
      companyDescription: form.companyDescription, companyStrength: form.companyStrength, companyFinancials: form.companyFinancials, contactInfo: form.contactInfo,
      faqs: form.faqs, leads: form.leads, partners: form.partners,
      pdfSeries: form.pdfSeries, onlineSeries: form.onlineSeries,
      asbaNames: { resident: form.asbaResidentName, syndicate: form.asbaSyndicateName, single: form.asbaSingleName },
      sharesSize: form.sharesSize, shareResv: form.shareResv, resvRemarks: form.resvRemarks, resvRemarks2: form.resvRemarks2,
    },
  });

  const onSave = async () => {
    if (!/^[A-Z0-9]{2,12}$/.test(form.symbol)) { setErr('Enter a valid Symbol (2–12 uppercase letters/digits).'); setTab('basic'); return; }
    if (!form.name.trim()) { setErr('Enter the IPO name.'); setTab('basic'); return; }
    setBusy(true); setErr(null); setSavedMsg(null);
    try {
      if (editing && ipoId) await api.updateIpo(ipoId, { ...payload(), symbol: form.symbol });
      else await api.createIpo({ ...payload(), symbol: form.symbol });
      router.push('/admin/catalog');
    } catch (e: any) { setErr(String(e?.message ?? e)); setBusy(false); }
  };
  const onReset = () => { setForm(initial.current); setErr(null); setSavedMsg('Form reset.'); };

  const tabIdx = TABS.findIndex((t) => t.key === tab);
  const go = (d: number) => { const t = TABS[tabIdx + d]; if (t) { setTab(t.key); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }); } };

  // Masters: lead managers feed the Partner + Lead Manager dropdowns; registrars feed
  // the Registrar dropdown. HOOKS MUST STAY ABOVE THE EARLY RETURNS below (React #310).
  const [leadMasters, setLeadMasters] = useState<api.MasterRow[]>([]);
  const [registrarMasters, setRegistrarMasters] = useState<api.MasterRow[]>([]);
  const [issueTypeMasters, setIssueTypeMasters] = useState<api.MasterRow[]>([]);
  const [categoryMasters, setCategoryMasters] = useState<api.MasterRow[]>([]);
  useEffect(() => {
    api.fetchMaster('lead-managers').then((r) => setLeadMasters(r.filter((x) => x.active))).catch(() => {});
    api.fetchMaster('registrars').then((r) => setRegistrarMasters(r.filter((x) => x.active))).catch(() => {});
    api.fetchMaster('issue-types').then((r) => setIssueTypeMasters(r.filter((x) => x.active))).catch(() => {});
    api.fetchMaster('ipo-categories').then((r) => setCategoryMasters(r.filter((x) => x.active))).catch(() => {});
  }, []);

  if (!operatorCan(me, 'ipos.manage')) return <NoAccess />;
  if (loading) return <Loader />;
  const phase = ipoPhase({ status: form.status, openDate: form.openDate, closeDate: form.closeDate, allotmentDate: form.allotmentDate, listingDate: form.listingDate });

  const issueTypeOptions = issueTypeMasters.length ? issueTypeMasters.map((t) => t.name) : [...ISSUE_TYPES];
  /** Selecting an issue type auto-matches its linked IPO Category (and the platform type). */
  const pickIssueType = (name: string) => {
    const it = issueTypeMasters.find((t) => t.name === name);
    if (it?.category) set({ issueType: name, categoryName: it.category.name, type: it.category.baseType === 'sme' ? 'sme' : 'mainboard' });
    else set({ issueType: name });
  };
  const pickCategory = (name: string) => {
    const c = categoryMasters.find((x) => x.name === name);
    if (c) set({ categoryName: name, type: c.baseType === 'sme' ? 'sme' : 'mainboard' });
    else set({ categoryName: name });
  };
  const syndicate = leadMasters.map((m) => m.name); // fully master-driven (Masters → Lead Managers)
  const pickRegistrar = (name: string) => {
    const m = registrarMasters.find((r) => r.name === name);
    if (!m) { set({ registrar: name }); return; }
    set({ registrar: m.name, registrarEmail: m.email ?? '', registrarPhone: m.phone ?? m.mobile ?? '', registrarUrl: m.allotmentUrl ?? '' });
  };

  // Retail Cut Off is derived: price-band max − retail discount (discount 0 ⇒ equals max band).
  const retailCutOffCalc = (() => {
    const max = Number(form.priceBandMax);
    if (!Number.isFinite(max) || max <= 0) return '';
    const disc = Number(form.retailDiscount) || 0;
    return String(Math.max(0, max - disc));
  })();

  const szInput = (key: string, field: keyof SzCell) => <input className="input mono" value={form.sharesSize[key][field]} onChange={(e) => setSz(key, { [field]: e.target.value } as Partial<SzCell>)} />;
  const szRow = (r: { key: string; label: string; extra?: boolean }) => (
    <tr key={r.key}>
      <th className="sz-lbl">{r.label}</th>
      <td>{szInput(r.key, 'share')}</td><td>{szInput(r.key, 'minP')}</td><td>{szInput(r.key, 'maxP')}</td>
      {r.extra ? <><td>{szInput(r.key, 'ncd')}</td><td>{szInput(r.key, 'ind')}</td><td>{szInput(r.key, 'hni')}</td></>
        : <><td className="sz-off" /><td className="sz-off" /><td className="sz-off" /></>}
    </tr>
  );

  // Application-series members are restricted to the partners added in Basic Details → IPO Partner.
  const partnerMembers = Array.from(new Set(form.partners.map((p) => p.member).filter(Boolean)));
  const seriesPanel = (title: string, desc: string, key: 'pdfSeries' | 'onlineSeries', radio: string) => {
    const list = form[key];
    const withExchange = key === 'onlineSeries'; // the ACTIVE row's exchange routes native bids
    return (
      <Panel title={title} desc={desc} actions={<button type="button" className="btn btn-secondary btn-sm" disabled={partnerMembers.length === 0} onClick={() => addSeries(key)}><Icon name="plus" size={13} /> Add series</button>}>
        {partnerMembers.length === 0 ? <div className="banner info" style={{ fontSize: 13 }}>Add syndicate members in <b>Basic Details → IPO Partner</b> first — only those members can have application series.</div> :
          list.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No series yet. Click <b>Add series</b>.</div> :
          <div style={{ overflowX: 'auto' }}>
            <table className="table rb-table" style={{ width: '100%' }}>
              <thead><tr><th>Syndicate Member</th><th>From</th><th>To</th>{withExchange && <th style={{ width: 92 }}>Exchange</th>}<th style={{ width: 70 }}>Active</th><th style={{ width: 54 }}>Action</th></tr></thead>
              <tbody>
                {list.map((s, i) => (
                  <tr key={i} className={s.active ? 'row-on' : ''}>
                    <td><select className="input" value={s.member} onChange={(e) => setSeries(key, i, { member: e.target.value })}>{partnerMembers.map((m) => <option key={m} value={m}>{m}</option>)}</select></td>
                    <td><input className="input mono" value={s.from} onChange={(e) => setSeries(key, i, { from: e.target.value.replace(/\D/g, '') })} placeholder="12000001" /></td>
                    <td><input className="input mono" value={s.to} onChange={(e) => setSeries(key, i, { to: e.target.value.replace(/\D/g, '') })} placeholder="13000000" /></td>
                    {withExchange && <td><select className="input" value={s.exchange ?? 'NSE'} onChange={(e) => setSeries(key, i, { exchange: e.target.value })}><option value="NSE">NSE</option><option value="BSE">BSE</option></select></td>}
                    <td style={{ textAlign: 'center' }}><input type="radio" name={radio} checked={s.active} onChange={() => activate(key, i)} style={{ width: 17, height: 17, accentColor: 'var(--brand)' }} /></td>
                    <td><button type="button" className="icon-btn danger" onClick={() => set({ [key]: list.filter((_, x) => x !== i) } as Partial<FormState>)} title="Remove"><Icon name="trash" size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>The <b>active</b> series is the one the system issues numbers from — only one can be active at a time.</div>
          </div>}
      </Panel>
    );
  };

  return (
    <div className="ipo-form">
      <PageHead
        back={{ href: '/admin/catalog', label: 'IPO List' }}
        title={editing ? `Edit IPO — ${form.symbol}` : 'Add / Edit IPO'}
        sub="Create a new IPO or update existing IPO information."
        actions={
          <>
            <a className="btn btn-secondary" href="/admin/catalog"><Icon name="arrow-right" size={15} style={{ transform: 'rotate(180deg)' }} /> Back to List</a>
            <button className="btn btn-secondary" onClick={onReset}><Icon name="refresh" size={15} /> Reset</button>
            <button className="btn" disabled={busy} onClick={onSave}><Icon name="check" size={15} /> {busy ? 'Saving…' : 'Save IPO'}</button>
          </>
        }
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}
      {savedMsg && <div className="banner ok" style={{ marginBottom: 14 }}>{savedMsg}</div>}

      <div className="card"><div className="card-pad" style={{ paddingBottom: 20 }}>
        <div className="iform-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={`iform-tab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>
              <span className="ic"><Icon name={t.icon} size={16} /></span>{t.label}
            </button>
          ))}
        </div>

        {/* ================= Basic Details ================= */}
        {tab === 'basic' && (
          <div className="fstack">
            <Panel title="Basic Information">
              <div className="form-grid">
                <Field label="IPO Name / Company" required span={2}><input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Acme Technologies Limited" /></Field>
                <Field label="Symbol" required><input className="input mono" value={form.symbol} onChange={(e) => set({ symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })} placeholder="ACME" /></Field>
                <Field label="Issue Type" required><select className="input" value={form.issueType} onChange={(e) => pickIssueType(e.target.value)}>{Array.from(new Set([...issueTypeOptions, form.issueType].filter(Boolean))).map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
                <Field label="IPO Category" required>
                  {categoryMasters.length ? (
                    <select className="input" value={form.categoryName || ''} onChange={(e) => pickCategory(e.target.value)}>
                      <option value="">— select category —</option>
                      {Array.from(new Set([...categoryMasters.map((c) => c.name), ...(form.categoryName ? [form.categoryName] : [])])).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : (
                    <select className="input" value={form.type} onChange={(e) => set({ type: e.target.value })}><option value="mainboard">Main Board IPO</option><option value="sme">SME IPO</option></select>
                  )}
                </Field>
                <Field label="ISIN"><input className="input mono" value={form.isin} onChange={(e) => set({ isin: e.target.value })} placeholder="INE000000000" /></Field>
                <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                  <Field label="Face Value (₹)"><input className="input mono" value={form.faceValue} onChange={(e) => set({ faceValue: e.target.value })} placeholder="2.00" /></Field>
                  <Field label="Lot Size"><input className="input mono" value={form.lotSize} onChange={(e) => set({ lotSize: e.target.value })} placeholder="1" /></Field>
                  <Field label="Is Active"><div style={{ paddingTop: 3 }}><Toggle on={isActive} onChange={(v) => set({ status: v ? 'upcoming' : 'withdrawn' })} /></div></Field>
                  <Field label="Shareholder Allowed"><div style={{ paddingTop: 3 }}><Toggle on={form.allowShareholder} onChange={(v) => set({ allowShareholder: v })} /></div></Field>
                  <Field label="Employee Allowed"><div style={{ paddingTop: 3 }}><Toggle on={form.allowEmployee} onChange={(v) => set({ allowEmployee: v })} /></div></Field>
                </div>
                {editing && (
                  <Field label="Live subscription" span={2}>
                    <div style={{ paddingTop: 3, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <Toggle on={form.autoPollSubscription} onChange={(v) => set({ autoPollSubscription: v })} />
                      <button type="button" className="btn btn-secondary btn-sm" onClick={refreshSub}><Icon name="refresh" size={13} /> Refresh now</button>
                      {subMsg && <span className="muted" style={{ fontSize: 12 }}>{subMsg}</span>}
                    </div>
                  </Field>
                )}
              </div>
            </Panel>

            <Panel title="Pricing & Issue">
              <div className="form-grid">
                <Field label="Price band — min (₹)"><input className="input mono" value={form.priceBandMin} onChange={(e) => set({ priceBandMin: e.target.value })} /></Field>
                <Field label="Price band — max (₹)"><input className="input mono" value={form.priceBandMax} onChange={(e) => set({ priceBandMax: e.target.value })} /></Field>
                <Field label="Retail Discount (₹)"><input className="input mono" value={form.retailDiscount} onChange={(e) => set({ retailDiscount: e.target.value })} /></Field>
                <Field label="Retail Cut Off (₹)" hint="auto: max band − discount"><input className="input mono" readOnly style={{ background: 'var(--bg-subtle)' }} value={retailCutOffCalc} /></Field>
                <Field label="Max amt — Retail (₹)"><input className="input mono" value={form.maxAmtRetail} onChange={(e) => set({ maxAmtRetail: e.target.value })} /></Field>
                <Field label="No. of App"><input className="input mono" value={form.noOfApp} onChange={(e) => set({ noOfApp: e.target.value.replace(/\D/g, '') })} /></Field>
              </div>
            </Panel>

            <Panel title="Important Dates">
              <div className="form-grid">
                <Field label="Anchor date (date & time)" hint="Anchor investor bidding — day before open"><input type="datetime-local" className="input mono" value={form.anchorDate} onChange={(e) => set({ anchorDate: e.target.value })} /></Field>
                <Field label="Issue Open (date & time)"><input type="datetime-local" className="input mono" value={form.openDate} onChange={(e) => set({ openDate: e.target.value })} /></Field>
                <Field label="Issue Close (date & time)"><input type="datetime-local" className="input mono" value={form.closeDate} onChange={(e) => set({ closeDate: e.target.value })} /></Field>
                <Field label="Issue Close — QIB (date & time)" hint="Internal — HNI can't bid after"><input type="datetime-local" className="input mono" value={form.qibCloseDate} onChange={(e) => set({ qibCloseDate: e.target.value })} /></Field>
                <Field label="Basis of allotment"><input type="date" className="input mono" value={form.allotmentDate} onChange={(e) => set({ allotmentDate: e.target.value })} /></Field>
                <Field label="Refund date"><input type="date" className="input mono" value={form.refundDate} onChange={(e) => set({ refundDate: e.target.value })} /></Field>
                <Field label="Demat credit"><input type="date" className="input mono" value={form.dematDate} onChange={(e) => set({ dematDate: e.target.value })} /></Field>
                <Field label="Listing date"><input type="date" className="input mono" value={form.listingDate} onChange={(e) => set({ listingDate: e.target.value })} /></Field>
              </div>
            </Panel>

            {/* IPO Partner | Syndicate / Lead Managers — side by side */}
            <div className="form-cols" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div className="fcol">
                <Panel title="IPO Partner" actions={<button type="button" className="btn btn-secondary btn-sm" disabled={!syndicate.length} onClick={() => set({ partners: [...form.partners, { member: syndicate[0], exchange: '' }] })}><Icon name="plus" size={13} /> Add</button>}>
                  {!syndicate.length ? <div className="banner info" style={{ fontSize: 13 }}>Add members in <b>Masters → Lead Managers</b> first.</div> :
                    form.partners.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No partners yet. Click <b>Add</b>.</div> :
                    <div className="lead-list">
                      {form.partners.map((p, i) => (
                        <div className="lead-row" key={i} style={{ gridTemplateColumns: '1fr auto' }}>
                          <select className="input" value={p.member} onChange={(e) => setPartner(i, { member: e.target.value })}>{Array.from(new Set([...syndicate, p.member].filter(Boolean))).map((m) => <option key={m} value={m}>{m}</option>)}</select>
                          <button type="button" className="icon-btn danger" onClick={() => set({ partners: form.partners.filter((_, x) => x !== i) })} title="Remove"><Icon name="trash" size={15} /></button>
                        </div>
                      ))}
                    </div>}
                </Panel>
              </div>
              <div className="fcol">
                <Panel title="Syndicate / Lead Managers" actions={<button type="button" className="btn btn-secondary btn-sm" disabled={!syndicate.length} onClick={() => set({ leads: [...form.leads, syndicate[0]] })}><Icon name="plus" size={13} /> Add</button>}>
                  {!syndicate.length ? <div className="banner info" style={{ fontSize: 13 }}>Add members in <b>Masters → Lead Managers</b> first.</div> :
                    form.leads.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No lead managers yet. Click <b>Add</b>.</div> :
                    <div className="lead-list">
                      {form.leads.map((name, i) => (
                        <div className="lead-row" key={i} style={{ gridTemplateColumns: '1fr auto' }}>
                          <select className="input" value={name} onChange={(e) => set({ leads: form.leads.map((m, x) => (x === i ? e.target.value : m)) })}>{Array.from(new Set([...syndicate, name].filter(Boolean))).map((m) => <option key={m} value={m}>{m}</option>)}</select>
                          <button type="button" className="icon-btn danger" onClick={() => set({ leads: form.leads.filter((_, x) => x !== i) })} title="Remove"><Icon name="trash" size={15} /></button>
                        </div>
                      ))}
                    </div>}
                </Panel>
              </div>
              <div className="fcol">
                <Panel title="Registrar Information">
                  {registrarMasters.length ? (
                    <select className="input" value={form.registrar} onChange={(e) => pickRegistrar(e.target.value)}>
                      <option value="">— select registrar —</option>
                      {Array.from(new Set([...registrarMasters.map((r) => r.name), ...(form.registrar ? [form.registrar] : [])])).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : (
                    <div className="banner info" style={{ fontSize: 13 }}>Add registrars in <b>Masters → Registrars</b> first.</div>
                  )}
                </Panel>
              </div>
            </div>
          </div>
        )}

        {/* ================= Shares & Reservation ================= */}
        {tab === 'shares' && (
          <div className="fstack">
            <Panel title="Shares Size Info">
              <div style={{ overflowX: 'auto' }}>
                <table className="table sz-table" style={{ width: '100%' }}>
                  <thead><tr><th /><th>Share</th><th>Min Price(Cr.)</th><th>Max Price(Cr.)</th><th>NCD Max Price</th><th>IND</th><th>HNI</th></tr></thead>
                  <tbody>
                    {SZ_ROWS.map(szRow)}
                    <tr className="sz-total">
                      <th className="sz-lbl">Total</th>
                      <td><input className="input mono" disabled value={szSum('share')} /></td>
                      <td><input className="input mono" disabled value={szSum('minP').toFixed(2)} /></td>
                      <td><input className="input mono" disabled value={szSum('maxP').toFixed(2)} /></td>
                      <td className="sz-off" /><td className="sz-off" /><td className="sz-off" />
                    </tr>
                    {SZ_TAIL.map(szRow)}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Share Reservation" desc="Tick the categories that apply. HNI (Big) and HNI (Small) are separate quotas.">
              <div style={{ overflowX: 'auto' }}>
                <table className="table resv-table" style={{ width: '100%' }}>
                  <thead><tr><th style={{ width: 40 }} /><th>Category</th><th>Share(%)</th><th>Share Count</th><th>Category Remark</th><th>Require for 1X</th></tr></thead>
                  <tbody>
                    {RESV_ROWS.map((r) => (
                      <tr key={r.key} className={form.shareResv[r.key].on ? 'row-on' : ''}>
                        <td style={{ textAlign: 'center' }}><input type="checkbox" checked={form.shareResv[r.key].on} onChange={(e) => setResv(r.key, { on: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} /></td>
                        <td style={{ fontWeight: 600, fontSize: 12.5 }}>{r.label}</td>
                        <td><input className="input mono" value={form.shareResv[r.key].pct} onChange={(e) => setResv(r.key, { pct: e.target.value })} /></td>
                        <td><input className="input mono" value={form.shareResv[r.key].count} onChange={(e) => setResv(r.key, { count: e.target.value })} /></td>
                        <td><input className="input" value={form.shareResv[r.key].remark} onChange={(e) => setResv(r.key, { remark: e.target.value })} placeholder="RS.225.00 CR" /></td>
                        <td><input className="input mono" value={form.shareResv[r.key].req1x} onChange={(e) => setResv(r.key, { req1x: e.target.value })} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-grid one" style={{ marginTop: 12 }}>
                <Field label="Remarks"><input className="input" value={form.resvRemarks} onChange={(e) => set({ resvRemarks: e.target.value })} placeholder="Fresh Issue of Equity Shares of up to Rs. 400 Cr and Offer for Sale…" /></Field>
                <Field label="Remarks 2"><input className="input" value={form.resvRemarks2} onChange={(e) => set({ resvRemarks2: e.target.value })} placeholder="BRLM: DAM Capital Advisors" /></Field>
              </div>
            </Panel>
          </div>
        )}

        {/* ================= About Company ================= */}
        {tab === 'company' && (
          <div className="fstack">
            <Panel title="Company Profile">
              <div className="form-grid">
                <Field label="Company Logo">
                  <div className="up-tile">
                    <img className="up-preview" src={form.logoUrl || undefined} alt="" style={form.logoUrl ? {} : { background: 'var(--bg-2)' }} />
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: 'none' }} onChange={(e) => onLogo(e.target.files?.[0])} />
                    <button type="button" className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : form.logoUrl ? 'Replace logo' : 'Upload logo'}</button>
                    {form.logoUrl && <button type="button" className="icon-btn danger" onClick={() => set({ logoUrl: '' })} title="Remove logo"><Icon name="trash" size={15} /></button>}
                  </div>
                </Field>
                <Field label="Company Website"><input className="input" value={form.companyWebsite} onChange={(e) => set({ companyWebsite: e.target.value })} placeholder="https://www.company.com" /></Field>
                <Field label="Company Promoter"><input className="input" value={form.companyPromoter} onChange={(e) => set({ companyPromoter: e.target.value })} placeholder="Promoter name(s)" /></Field>
              </div>
            </Panel>
            <Panel title="Company Info" desc="Shown on the public IPO page."><RichText value={form.companyDescription} onChange={(html) => set({ companyDescription: html })} /></Panel>
            <Panel title="Company Strength"><RichText value={form.companyStrength} onChange={(html) => set({ companyStrength: html })} /></Panel>
            <Panel title="Company Financials" desc="Add the financial-highlights table."><RichText value={form.companyFinancials} onChange={(html) => set({ companyFinancials: html })} /></Panel>
            <Panel title="Objects of the Issue"><RichText value={form.objectsOfIssue} onChange={(html) => set({ objectsOfIssue: html })} /></Panel>
            <Panel title="Company Contact Info"><RichText value={form.contactInfo} onChange={(html) => set({ contactInfo: html })} /></Panel>
            <Panel title="FAQs" desc="Question + answer shown on the IPO page." actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ faqs: [...form.faqs, { q: '', a: '' }] })}><Icon name="plus" size={13} /> Add FAQ</button>}>
              {form.faqs.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No FAQs yet. Click <b>Add FAQ</b>.</div> :
                <div className="fstack">
                  {form.faqs.map((f, i) => (
                    <div className="faq-item" key={i}>
                      <div className="between" style={{ marginBottom: 8 }}><b style={{ fontSize: 13 }}>FAQ {i + 1}</b><button type="button" className="icon-btn danger" onClick={() => set({ faqs: form.faqs.filter((_, x) => x !== i) })} title="Remove"><Icon name="trash" size={15} /></button></div>
                      <Field label="Question"><input className="input" value={f.q} onChange={(e) => setFaq(i, { q: e.target.value })} placeholder="What is the lot size?" /></Field>
                      <div className="field" style={{ marginTop: 4 }}><label>Answer</label><RichText value={f.a} onChange={(html) => setFaq(i, { a: html })} minHeight={110} /></div>
                    </div>
                  ))}
                </div>}
            </Panel>
          </div>
        )}

        {/* ================= Documents ================= */}
        {tab === 'docs' && (
          <Panel title="Documents" desc="Upload RHP / DRHP / prospectus and other files shown on the IPO page." actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ documents: [...form.documents, { type: 'RHP', name: '', url: '' }] })}><Icon name="plus" size={13} /> Add document</button>}>
            {form.documents.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No documents yet. Click <b>Add document</b>.</div> :
              <div className="lead-list">
                {form.documents.map((d, i) => (
                  <div className="doc-up" key={i}>
                    <select className="input" style={{ width: 170 }} value={d.type} onChange={(e) => setDoc(i, { type: e.target.value })}>{DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                    <div className="doc-file">{d.url ? <><Icon name="doc" size={15} /> <span className="mono" style={{ fontSize: 12.5 }}>{d.name || 'file'}</span></> : <span className="muted" style={{ fontSize: 13 }}>No file chosen</span>}</div>
                    <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                      {docBusy === i ? 'Uploading…' : d.url ? 'Replace' : <><Icon name="upload" size={14} /> Upload</>}
                      <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => onDocFile(i, e.target.files?.[0])} />
                    </label>
                    <button type="button" className="icon-btn danger" onClick={() => set({ documents: form.documents.filter((_, x) => x !== i) })} title="Remove"><Icon name="trash" size={15} /></button>
                  </div>
                ))}
              </div>}
          </Panel>
        )}
        {tab === 'docs' && (() => {
          const isMainboard = form.type === 'mainboard' && !/ncd|debt/i.test(form.issueType);
          const slot = (key: 'asbaResident' | 'asbaSyndicate' | 'asbaSingle', label: string, hint: string) => (
            <div className="doc-up">
              <span style={{ width: 210, fontSize: 13 }}>{label}<div className="muted" style={{ fontSize: 11 }}>{hint}</div></span>
              <div className="doc-file">{form[key] ? <><Icon name="doc" size={15} /> <span className="mono" style={{ fontSize: 12.5 }}>{(form[(key + 'Name') as keyof FormState] as string) || 'form.pdf'}</span></> : <span className="muted" style={{ fontSize: 13 }}>Not uploaded</span>}</div>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                {asbaBusy === key ? 'Uploading…' : form[key] ? 'Replace' : <><Icon name="upload" size={14} /> Upload PDF</>}
                <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => onAsbaFile(key, e.target.files?.[0])} />
              </label>
              {form[key] && <button type="button" className="icon-btn danger" onClick={() => set({ [key]: '', [key + 'Name']: '' } as Partial<FormState>)} title="Remove"><Icon name="trash" size={15} /></button>}
            </div>
          );
          return (
            <Panel title="ASBA Print Forms" desc="Blank bid-cum-application PDFs — the system overlays applicant data for the 'apply through bank' print feature.">
              <div className="lead-list">
                {isMainboard ? <>
                  {slot('asbaResident', 'Resident form', 'Used for bids up to ₹5,00,000')}
                  {slot('asbaSyndicate', 'Syndicate ASBA form', 'Used for bids above ₹5,00,000')}
                </> : slot('asbaSingle', 'Application form', 'Used for all bid amounts (SME / NCD)')}
              </div>
            </Panel>
          );
        })()}

        {/* ================= IPO Application Series ================= */}
        {tab === 'series' && (
          <div className="fstack">
            {seriesPanel('Application Series — PDF Printing', 'Ranges per syndicate member; the active one is used for prefilled-ASBA PDF printing.', 'pdfSeries', 'pdfActive')}
            {seriesPanel('Application Series — Online Apply', 'Ranges per syndicate member; the active one is used for online applications.', 'onlineSeries', 'onlineActive')}
          </div>
        )}

        {/* ---- wizard navigation ---- */}
        <div className="iform-nav">
          <button type="button" className="btn btn-secondary" disabled={tabIdx === 0} onClick={() => go(-1)}><Icon name="arrow-right" size={15} style={{ transform: 'rotate(180deg)' }} /> Previous</button>
          <span style={{ flex: 1 }} />
          {tabIdx < TABS.length - 1
            ? <button type="button" className="btn" onClick={() => go(1)}>Next: {TABS[tabIdx + 1].label} <Icon name="arrow-right" size={15} /></button>
            : <button type="button" className="btn" disabled={busy} onClick={onSave}><Icon name="check" size={15} /> {busy ? 'Saving…' : 'Save IPO'}</button>}
        </div>
      </div></div>
    </div>
  );
}
