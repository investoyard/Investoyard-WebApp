'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { Loader } from '@/components/ui/Loader';
import { PageHead, Panel, Field, Toggle } from '@/components/ui/Form';
import { RichText } from '@/components/ui/RichText';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { Icon } from '@/components/Icon';
import { ipoPhase } from '@/lib/format';
import * as api from '@/lib/tenants-admin';
import { computeIssue, CATEGORY_LABELS, exchangesFor, type IssueInputs, type LegBasis } from '@investoyard/shared-types';

type IconName = Parameters<typeof Icon>[0]['name'];
const DOC_TYPES = ['RHP', 'DRHP', 'Prospectus', 'Anchor allocation', 'Financials', 'Other'] as const;
const ISSUE_TYPES = ['IPO', 'FPO', 'Rights Issue', 'OFS'] as const;
/**
 * Tabs in the order of docs/ipo-entry-spec.md §8: each one depends only on the
 * tabs before it. That is not housekeeping — the reservation split cannot be
 * derived without lot size and a price, so Pricing HAS to precede Offer, and
 * bid windows depend on whether there is an anchor round, so Timeline follows
 * it. Identity, dates and three intermediary blocks used to share tab 1.
 */
/**
 * The tab order is the ORDER OF WORK, not the running order of the offer
 * document.
 *
 * Everything an issue needs before it can take an application or print a form
 * comes first — Issue Setup through Documents. What only comes into existence
 * later sits behind that and is marked `later`: the company write-up, which
 * fills the public detail page and blocks nothing, and the figures the
 * registrar and the exchanges publish once the issue has listed. An operator
 * entering a live issue can stop at Documents and know the record is fit to
 * open bidding on.
 *
 * `Anchor` is its own tab because its data used to sit in two places — the
 * portion on Offer & Reservation, the investor roster over on About Company —
 * so the roster could not be checked against the total it came out of.
 */
/**
 * Six tabs, in the order of work (operator decision, 2026-09-04). This was
 * ten. Three moves went into the collapse:
 *
 *   Anchor merged INTO Offer & Reservation — anchor is a portion of the same
 *   table and reading the roster against the total it comes out of is what
 *   the two-tab layout was preventing.
 *
 *   Intermediaries merged INTO Timeline — dates and who is involved sit
 *   together in the operator's head.
 *
 *   About Company and After Listing moved INTO Review & Publish as
 *   collapsible sections. Both are content that fills the public detail page
 *   and blocks nothing operational; keeping them out of the primary flow
 *   matches sir's "we can add the details a bit later".
 */
const TABS: { key: string; label: string; icon: IconName }[] = [
  { key: 'basic', label: 'Issue Setup', icon: 'box' },
  { key: 'pricing', label: 'Pricing', icon: 'rupee' },
  { key: 'offer', label: 'Offer, Reservation & Anchor', icon: 'chart' },
  { key: 'timeline', label: 'Timeline & Parties', icon: 'calendar' },
  { key: 'docs', label: 'Documents', icon: 'doc' },
  { key: 'review', label: 'Review & Publish', icon: 'check' },
];
// Shares Size Info rows
const SZ_ROWS: { key: string; label: string; extra?: boolean }[] = [
  { key: 'qib', label: 'QIB' }, { key: 'hni', label: 'HNI', extra: true }, { key: 'retail', label: 'Retail', extra: true },
  { key: 'employee', label: 'Employee' }, { key: 'shareholder', label: 'ShareHolder' }, { key: 'other', label: 'Other' },
];
// Share Reservation rows — HNI (Big) and HNI (Small) grouped together
const RESV_ROWS: { key: string; label: string }[] = [
  { key: 'qib', label: 'QIB' }, { key: 'hni', label: 'HNI (Big)' }, { key: 'hni2', label: 'HNI (Small)' },
  { key: 'retail', label: 'Retail' }, { key: 'employee', label: 'Employee' }, { key: 'shareholder', label: 'ShareHolder' }, { key: 'other', label: 'Other' },
];

type Doc = { type: string; name: string; url: string };
type Partner = { member: string; exchange: string };
type Series = { member: string; from: string; to: string; active: boolean; exchange?: string };
/**
 * A reservation row as STORED: the tick and the percentage, nothing else.
 *
 * Share count, category remark and require-for-1x used to live here too. They
 * are projections of `pct`, so persisting them created a second copy that could
 * — and did — drift from the number it was computed from.
 */
type Resv = { on: boolean; pct: string };
const blankResv = (): Resv => ({ on: false, pct: '' });
const blankShareResv = (): Record<string, Resv> => Object.fromEntries(RESV_ROWS.map((r) => [r.key, blankResv()]));
interface FormState {
  symbol: string; name: string; type: string; issueType: string; status: string; faceValue: string; lotSize: string; isin: string;
  autoPollSubscription: boolean;
  allowShareholder: boolean; allowEmployee: boolean; // reserved quotas this issue offers
  startBid: boolean; startPrint: boolean; // operator gates: apply/pre-apply + ASBA form printing
  categoryName: string; // IPO Category master name (drives type via its platform mapping)
  priceBandMin: string; priceBandMax: string;
  retailDiscount: string;
  /** applications RECEIVED — an operator observation. Not to be confused with
   *  applications-for-1x, which the engine derives. Was `noOfApp`. */
  applicationsReceived: string;
  /** offer structure — drives every derived figure (spec §5 Steps 1-2) */
  mechanism: string; regulationBasis: string;
  /** Which exchanges this issue lists on. SME usually lists on ONE platform;
   *  mainboard usually both. Previously invented by the API from the board. */
  exNse: boolean; exBse: boolean;
  /** total offer in ₹ Cr — Fresh/OFS below split it */
  issueSizeCr: string;
  tickSize: string; employeeDiscount: string; shareholderDiscount: string; finalIssuePrice: string;
  /** anchor as a % of the QIB quota — the input B09 checks against the rule pack */
  anchorPct: string;
  /** off-the-top reservations, taken before the category split */
  cvEmployee: string; cvShareholder: string; cvMarketMaker: string;
  /** per-applicant employee caps, ₹ — the RHP states both */
  empMaxPerApplicant: string; empInitialPerApplicant: string;
  /** anchor detail beyond the % of QIB */
  anchorMfPct: string; lockin1Pct: string; lockin1Days: string; lockin2Days: string;
  /** the withdrawal trigger, % of the fresh issue */
  minSubscriptionPct: string;
  /** SEBI's UPI mandate confirmation deadline */
  upiMandateCutoff: string;
  freshBasis: string; freshValue: string; ofsBasis: string; ofsValue: string;
  bseListingPrice: string; nseListingPrice: string;
  registrar: string; registrarEmail: string; registrarPhone: string; registrarUrl: string;
  logoUrl: string; companyWebsite: string; companyPromoter: string;
  companyDescription: string; companyStrength: string; companyFinancials: string; contactInfo: string; objectsOfIssue: string;
  faqs: { q: string; a: string }[];
  anchorDate: string; refundDate: string;
  openDate: string; closeDate: string; qibCloseDate: string; allotmentDate: string; dematDate: string; listingDate: string;
  documents: Doc[]; leads: string[]; partners: Partner[]; pdfSeries: Series[]; onlineSeries: Series[];
  shareResv: Record<string, Resv>; resvRemarks: string;
  asbaResident: string; asbaSyndicate: string; asbaSingle: string; asbaShareholder: string; // blank ASBA form PDFs (URLs) for prefill printing
  asbaResidentName: string; asbaSyndicateName: string; asbaSingleName: string; asbaShareholderName: string; // original file names (display)
  /**
   * Anchor book as allotted, from the anchor intimation. `shares` and `pct`
   * come off the document beside the amount; the three are cross-checked
   * against each other and against `anchorShares` in the panel.
   */
  anchors: { name: string; shares: string; pct: string; amount: string }[];
  /**
   * Total offer in SHARES as the offer document states it. Authoritative —
   * see the `totalShares` note on IssueInputs.
   */
  totalShares: string;
  /** anchor book as allotted: the portion in shares and the price it struck */
  anchorShares: string; anchorPrice: string;
  /** the bank that warehouses UPI mandates for this issue */
  sponsorBank: string;
  /**
   * What kind of offer this is, as distinct from which board it lists on.
   * The FPO variants of 48 catalogue reports depend on it.
   */
  instrument: string;
  /**
   * Two rungs of one classification. `sector` is the broad, master-backed group
   * (Finance · Pharma · IT · Bank); `industry` is the exchanges' fine Basic
   * Industry beneath it (146 values). Many industries roll up into one sector,
   * which is how the 850 already-classified records got a sector without re-entry.
   */
  sector: string; industry: string;
}
const blankForm = (): FormState => ({
  symbol: '', name: '', type: 'mainboard', issueType: 'IPO', status: 'upcoming', faceValue: '', lotSize: '', isin: '',
  autoPollSubscription: true,
  allowShareholder: false, allowEmployee: false,
  startBid: false, startPrint: false, // OFF until the operator explicitly opens bidding/printing
  categoryName: '',
  priceBandMin: '', priceBandMax: '',
  retailDiscount: '', applicationsReceived: '',
  mechanism: 'book_built', regulationBasis: '', freshBasis: 'none', freshValue: '', ofsBasis: 'none', ofsValue: '',
  exNse: true, exBse: true, issueSizeCr: '',
  tickSize: '', employeeDiscount: '', shareholderDiscount: '', finalIssuePrice: '', anchorPct: '',
  cvEmployee: '', cvShareholder: '', cvMarketMaker: '',
  empMaxPerApplicant: '', empInitialPerApplicant: '',
  anchorMfPct: '', lockin1Pct: '', lockin1Days: '', lockin2Days: '',
  minSubscriptionPct: '', upiMandateCutoff: '',
  bseListingPrice: '', nseListingPrice: '',
  registrar: '', registrarEmail: '', registrarPhone: '', registrarUrl: '',
  logoUrl: '', companyWebsite: '', companyPromoter: '',
  companyDescription: '', companyStrength: '', companyFinancials: '', contactInfo: '', objectsOfIssue: '',
  faqs: [],
  anchorDate: '', refundDate: '',
  openDate: '', closeDate: '', qibCloseDate: '', allotmentDate: '', dematDate: '', listingDate: '',
  documents: [], leads: [], partners: [], pdfSeries: [], onlineSeries: [],
  shareResv: blankShareResv(), resvRemarks: '',
  asbaResident: '', asbaSyndicate: '', asbaSingle: '', asbaShareholder: '',
  asbaResidentName: '', asbaSyndicateName: '', asbaSingleName: '', asbaShareholderName: '',
  anchors: [],
  totalShares: '', anchorShares: '', anchorPrice: '', sponsorBank: '',
  instrument: 'ipo', sector: '', industry: '',
});
const ASBA_TYPES = ['asba_form_resident', 'asba_form_syndicate', 'asba_form_single', 'asba_form_shareholder'];
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
          startBid: ex.startBid === true, startPrint: ex.startPrint === true,
          priceBandMin: str(d.priceBandMin), priceBandMax: str(d.priceBandMax), lotSize: str(d.lotSize),
          registrar: str(d.registrar), logoUrl: str(d.logoUrl), objectsOfIssue: str(d.objectsOfIssue),
          openDate: str(ex.openDate) || toDT(d.openDate), closeDate: str(ex.closeDate) || toDT(d.closeDate), allotmentDate: str(d.allotmentDate), listingDate: str(d.listingDate),
          documents: (d.documents ?? []).filter((x) => !ASBA_TYPES.includes(x.type)).map((x) => ({ type: x.type, name: x.type, url: x.url })),
          asbaResident: str((d.documents ?? []).find((x) => x.type === 'asba_form_resident')?.url),
          asbaSyndicate: str((d.documents ?? []).find((x) => x.type === 'asba_form_syndicate')?.url),
          asbaSingle: str((d.documents ?? []).find((x) => x.type === 'asba_form_single')?.url),
          asbaShareholder: str((d.documents ?? []).find((x) => x.type === 'asba_form_shareholder')?.url),
          asbaResidentName: str(ex.asbaNames?.resident), asbaSyndicateName: str(ex.asbaNames?.syndicate), asbaSingleName: str(ex.asbaNames?.single), asbaShareholderName: str(ex.asbaNames?.shareholder),
          // legacy rows carry name + amount only; the two new columns read blank
          anchors: Array.isArray(ex.anchors)
            ? ex.anchors.map((a: any) => ({
                name: String(a?.name ?? ''), shares: str(a?.shares),
                pct: str(a?.pct), amount: String(a?.amount ?? ''),
              }))
            : [],
          totalShares: str(ex.totalShares), anchorShares: str(ex.anchorShares),
          anchorPrice: str(ex.anchorPrice), sponsorBank: str(ex.sponsorBank),
          instrument: str((d as any).instrument) || 'ipo',
          sector: str(ex.sector), industry: str(ex.industry),
          // ---- extended fields (from extra JSON) ----
          issueType: ex.issueType ?? 'IPO', faceValue: str(ex.faceValue), categoryName: str(ex.categoryName),
          retailDiscount: str(ex.retailDiscount),
          // `noOfApp` is the legacy name for the same operator observation
          applicationsReceived: str(ex.applicationsReceived ?? ex.noOfApp),
          mechanism: str(ex.mechanism) || 'book_built', regulationBasis: str(ex.regulationBasis),
          exNse: (d.exchanges ?? []).some((x: string) => /nse/i.test(x)) || !(d.exchanges ?? []).length,
          exBse: (d.exchanges ?? []).some((x: string) => /bse/i.test(x)) || !(d.exchanges ?? []).length,
          issueSizeCr: str(ex.issueSizeCr ?? d.issueSizeCr ?? ''),
          tickSize: str(ex.tickSize), employeeDiscount: str(ex.employeeDiscount),
          shareholderDiscount: str(ex.shareholderDiscount), finalIssuePrice: str(ex.finalIssuePrice),
          anchorPct: str(ex.anchorPct),
          cvEmployee: str(ex.carveouts?.employee), cvShareholder: str(ex.carveouts?.shareholder),
          cvMarketMaker: str(ex.carveouts?.marketmaker),
          empMaxPerApplicant: str(ex.empMaxPerApplicant), empInitialPerApplicant: str(ex.empInitialPerApplicant),
          anchorMfPct: str(ex.anchorMfPct), lockin1Pct: str(ex.lockin1Pct),
          lockin1Days: str(ex.lockin1Days), lockin2Days: str(ex.lockin2Days),
          minSubscriptionPct: str(ex.minSubscriptionPct), upiMandateCutoff: str(ex.upiMandateCutoff),
          freshBasis: str(ex.fresh?.basis) || 'none', freshValue: str(ex.fresh?.value),
          ofsBasis: str(ex.ofs?.basis) || 'none', ofsValue: str(ex.ofs?.value),
          bseListingPrice: str(ex.bseListingPrice), nseListingPrice: str(ex.nseListingPrice),
          qibCloseDate: str(ex.qibCloseDate), dematDate: str(ex.dematDate),
          anchorDate: str(ex.anchorDate), refundDate: str(ex.refundDate),
          registrarEmail: str(ex.registrarEmail), registrarPhone: str(ex.registrarPhone), registrarUrl: str(ex.registrarUrl),
          companyWebsite: str(ex.companyWebsite), companyPromoter: str(ex.companyPromoter),
          companyDescription: str(ex.companyDescription), companyStrength: str(ex.companyStrength), companyFinancials: str(ex.companyFinancials), contactInfo: str(ex.contactInfo),
          faqs: Array.isArray(ex.faqs) ? ex.faqs : [], leads: Array.isArray(ex.leads) ? ex.leads : [], partners: Array.isArray(ex.partners) ? ex.partners : [],
          pdfSeries: Array.isArray(ex.pdfSeries) ? ex.pdfSeries : [], onlineSeries: Array.isArray(ex.onlineSeries) ? ex.onlineSeries : [],
          // legacy rows carry count/remark/req1x — read the inputs only and let
          // the derived columns come from the engine
          shareResv: ex.shareResv
            ? Object.fromEntries(RESV_ROWS.map((r) => [r.key, { on: !!ex.shareResv[r.key]?.on, pct: str(ex.shareResv[r.key]?.pct) }]))
            : (() => { const sr = blankShareResv(); (d.reservations ?? []).forEach((k) => { if (sr[k]) sr[k].on = true; }); return sr; })(),
          resvRemarks: str(ex.resvRemarks),
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
  const setResv = (key: string, part: Partial<Resv>) => set({ shareResv: { ...form.shareResv, [key]: { ...form.shareResv[key], ...part } } });
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
  // Anchor Investors master (Masters → Anchor Investors) — picked per IPO with a ₹ amount
  const [anchorOpts, setAnchorOpts] = useState<api.MasterRow[]>([]);
  useEffect(() => { api.fetchMaster('anchors').then(setAnchorOpts).catch(() => {}); }, []);
  // Sector master (Masters → Sectors) — the dropdown can also create into it
  const [sectorOpts, setSectorOpts] = useState<api.MasterRow[]>([]);
  useEffect(() => { api.fetchMaster('sectors').then(setSectorOpts).catch(() => {}); }, []);
  const onAsbaFile = async (slot: 'asbaResident' | 'asbaSyndicate' | 'asbaSingle' | 'asbaShareholder', file?: File | null) => {
    if (!file) return;
    setAsbaBusy(slot); setErr(null);
    try { const r = await api.uploadPdf(file); set({ [slot]: r.url, [slot + 'Name']: r.name } as Partial<FormState>); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setAsbaBusy(null); }
  };

  /** SME lists on NSE Emerge / BSE SME; mainboard on the main boards. */
  const exchangeList = (): string[] => {
    // stores 'NSE Emerge' for SME; the screen shows it as 'NSE SME'
    return exchangesFor(form.type === 'sme', form.exNse, form.exBse);
  };

  const payload = (): api.IpoWrite => ({
    name: form.name, type: form.type, status: form.status, instrument: form.instrument,
    priceBandMin: num(form.priceBandMin), priceBandMax: num(form.priceBandMax), lotSize: num(form.lotSize),
    issueSizeCr: (num(form.issueSizeCr) ?? 0) > 0 ? num(form.issueSizeCr) : undefined,
    // explicit, not invented from the board — an SME issue may list on one platform only
    exchanges: exchangeList(),
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
      ...(form.asbaShareholder ? [{ type: 'asba_form_shareholder', url: form.asbaShareholder }] : []),
    ],
    autoPollSubscription: form.autoPollSubscription,
    extra: {
      issueType: form.issueType, faceValue: form.faceValue, categoryName: form.categoryName,
      retailDiscount: form.retailDiscount,
      // retailCutOff is NOT written — it is price cap minus retail discount,
      // recomputed wherever it is shown (spec B23).
      applicationsReceived: form.applicationsReceived,
      // mirrored under the old key while readers migrate — remove once
      // nothing greps for `noOfApp` (web/lib/api.ts was the last one)
      noOfApp: form.applicationsReceived,
      mechanism: form.mechanism, regulationBasis: form.regulationBasis || undefined,
      issueSizeCr: legSumCr || form.issueSizeCr,
      tickSize: form.tickSize, employeeDiscount: form.employeeDiscount,
      shareholderDiscount: form.shareholderDiscount, finalIssuePrice: form.finalIssuePrice,
      anchorPct: form.anchorPct,
      anchorMfPct: form.anchorMfPct, lockin1Pct: form.lockin1Pct,
      lockin1Days: form.lockin1Days, lockin2Days: form.lockin2Days,
      empMaxPerApplicant: form.empMaxPerApplicant, empInitialPerApplicant: form.empInitialPerApplicant,
      minSubscriptionPct: form.minSubscriptionPct, upiMandateCutoff: form.upiMandateCutoff,
      carveouts: { employee: form.cvEmployee, shareholder: form.cvShareholder, marketmaker: form.cvMarketMaker },
      fresh: form.freshBasis === 'none' ? undefined : { basis: form.freshBasis, value: Number(form.freshValue) || 0 },
      ofs: form.ofsBasis === 'none' ? undefined : { basis: form.ofsBasis, value: Number(form.ofsValue) || 0 },
      anchorDate: form.anchorDate, refundDate: form.refundDate,
      bseListingPrice: form.bseListingPrice, nseListingPrice: form.nseListingPrice,
      openDate: form.openDate, closeDate: form.closeDate, qibCloseDate: form.qibCloseDate, dematDate: form.dematDate,
      registrarEmail: form.registrarEmail, registrarPhone: form.registrarPhone, registrarUrl: form.registrarUrl,
      companyWebsite: form.companyWebsite, companyPromoter: form.companyPromoter,
      companyDescription: form.companyDescription, companyStrength: form.companyStrength, companyFinancials: form.companyFinancials, contactInfo: form.contactInfo,
      faqs: form.faqs, leads: form.leads, partners: form.partners,
      pdfSeries: form.pdfSeries, onlineSeries: form.onlineSeries,
      asbaNames: { resident: form.asbaResidentName, syndicate: form.asbaSyndicateName, single: form.asbaSingleName, shareholder: form.asbaShareholderName },
      // anchor investors (master-picked, per-IPO ₹ amount) → detail-page section
      anchors: form.anchors.filter((a) => a.name.trim()).map((a) => ({
        name: a.name.trim(), shares: a.shares.trim(), pct: a.pct.trim(), amount: a.amount.trim(),
      })),
      // stated share counts — inputs, not derivations (see the note in IssueInputs)
      totalShares: form.totalShares, anchorShares: form.anchorShares,
      anchorPrice: form.anchorPrice, sponsorBank: form.sponsorBank,
      sector: form.sector, industry: form.industry,
      startBid: form.startBid, startPrint: form.startPrint,
      // only the tick and the percentage; every other column is derived on read
      shareResv: Object.fromEntries(RESV_ROWS.map((r) => [r.key, { on: form.shareResv[r.key].on, pct: form.shareResv[r.key].pct }])),
      resvRemarks: offerRemark || form.resvRemarks,
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
  /**
   * The single derivation, recomputed on every keystroke.
   *
   * Share Count / Require for 1X / Category Remark are READ-ONLY projections of
   * this — the legacy form let an operator type them beside the percentages they
   * come from, and nothing reconciled the two. That is how three of six records
   * ended up publishing wrong figures.
   */
  const derived = useMemo(() => {
    const n = (v: string) => { const x = Number(String(v).replace(/[^\d.]/g, "")); return Number.isFinite(x) ? x : 0; };
    const reservation: Record<string, number> = {};
    for (const r of RESV_ROWS) { const c = form.shareResv[r.key]; if (c?.on) { const v = n(c.pct); if (v > 0) reservation[r.key] = v; } }
    const inputs: IssueInputs = {
      board: form.type === 'sme' ? 'sme' : 'mainboard',
      mechanism: form.mechanism === 'fixed_price' ? 'fixed_price' : 'book_built',
      regulationBasis: (form.regulationBasis || undefined) as any,
      lotSize: n(form.lotSize),
      priceFloor: n(form.priceBandMin),
      priceCap: n(form.priceBandMax),
      issueSizeCr: n(form.issueSizeCr) || undefined,
      totalShares: n(form.totalShares) || undefined,
      fresh: form.freshBasis === 'none' ? undefined : { basis: form.freshBasis as LegBasis, value: n(form.freshValue) },
      ofs: form.ofsBasis === 'none' ? undefined : { basis: form.ofsBasis as LegBasis, value: n(form.ofsValue) },
      reservation,
      discounts: {
        retail: n(form.retailDiscount),
        employee: n(form.employeeDiscount),
        shareholder: n(form.shareholderDiscount),
      },
      carveouts: [
        { key: 'employee', basis: 'amount' as const, value: n(form.cvEmployee) },
        { key: 'shareholder', basis: 'amount' as const, value: n(form.cvShareholder) },
        { key: 'marketmaker', basis: 'amount' as const, value: n(form.cvMarketMaker) },
      ].filter((c) => c.value > 0),
      // the datetime-local fields carry a time; the rules only want the day
      dates: {
        open: form.openDate.slice(0, 10) || undefined,
        close: form.closeDate.slice(0, 10) || undefined,
        allotment: form.allotmentDate.slice(0, 10) || undefined,
        refund: form.refundDate.slice(0, 10) || undefined,
        demat: form.dematDate.slice(0, 10) || undefined,
        listing: form.listingDate.slice(0, 10) || undefined,
      },
      finalIssuePrice: n(form.finalIssuePrice) || undefined,
      anchor: n(form.anchorPct) > 0 || n(form.anchorShares) > 0
        ? {
            pctOfQib: n(form.anchorPct) || undefined,
            mfPct: n(form.anchorMfPct) || undefined,
            shares: n(form.anchorShares) || undefined,
            price: n(form.anchorPrice) || undefined,
          }
        : undefined,
    };
    return computeIssue(inputs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.type, form.mechanism, form.regulationBasis, form.lotSize, form.priceBandMin, form.priceBandMax,
      form.freshBasis, form.freshValue, form.ofsBasis, form.ofsValue, form.retailDiscount,
      form.issueSizeCr, form.totalShares, form.cvEmployee, form.cvShareholder, form.cvMarketMaker,
      form.anchorPct, form.anchorMfPct, form.anchorShares, form.anchorPrice, form.finalIssuePrice,
      form.openDate, form.closeDate, form.allotmentDate, form.refundDate, form.dematDate, form.listingDate,
      JSON.stringify(form.shareResv)]);

  /**
   * The anchor roster against the portion it was allotted out of.
   *
   * This is the check that makes typing the per-investor counts worth doing:
   * the intimation lists every investor and states the total, so the rows have
   * a right answer and a mistyped digit shows up immediately. Percentages are
   * only tallied when every row carries one — a partially filled column would
   * always read as short.
   */
  const anchorRoster = useMemo(() => {
    const rows = form.anchors.filter((a) => a.name.trim());
    const counted = rows.filter((a) => a.shares.trim());
    if (!counted.length) return null;
    const shares = counted.reduce((t, a) => t + (Number(a.shares) || 0), 0);
    const total = Number(form.anchorShares) || 0;
    const parts = [`${counted.length} of ${rows.length} investor${rows.length === 1 ? '' : 's'} priced — ${shares.toLocaleString('en-IN')} shares`];
    let ok = true;
    if (total > 0) {
      const diff = shares - total;
      if (diff === 0) parts.push(`matching the ${total.toLocaleString('en-IN')} allotted`);
      else {
        ok = false;
        parts.push(`${Math.abs(diff).toLocaleString('en-IN')} ${diff > 0 ? 'over' : 'short of'} the ${total.toLocaleString('en-IN')} allotted`);
      }
    }
    if (rows.length && rows.every((a) => a.pct.trim())) {
      const pct = rows.reduce((t, a) => t + (Number(a.pct) || 0), 0);
      // the intimation rounds each row to two decimals, so the column rarely
      // lands on exactly 100 — half a point of drift is the document's, not ours
      if (Math.abs(pct - 100) > 0.5) { ok = false; parts.push(`percentages total ${pct.toFixed(2)}%, not 100%`); }
    }
    return { ok, text: parts.join(' · ') };
  }, [JSON.stringify(form.anchors), form.anchorShares]);

  /**
   * Why the derivation is empty, in the operator's words.
   *
   * computeIssue needs a lot size, a price and an offer size; without them it
   * returns nothing and every derived cell used to fall back to a dash with no
   * explanation. Naming the missing input is the difference between a form that
   * looks broken and one that is telling you what it still needs.
   */
  const derivedBlockedWhy = (() => {
    const n = (v: string) => { const x = Number(String(v).replace(/[^\d.]/g, '')); return Number.isFinite(x) ? x : 0; };
    const missing: string[] = [];
    if (!n(form.lotSize)) missing.push('Lot Size');
    if (!n(form.priceBandMax) && !n(form.priceBandMin) && !n(form.finalIssuePrice)) missing.push('a price');
    if (!n(form.issueSizeCr) && form.freshBasis === 'none' && form.ofsBasis === 'none') missing.push('the offer size (Fresh / OFS, or the total)');
    if (!missing.length) return 'Enter at least one reservation percentage to see the split.';
    return `Add ${missing.join(' and ')} on the Pricing and Offer tabs — share counts, amounts and forms-for-1x are all derived from them.`;
  })();

  /**
   * What each tab is still missing, keyed by tab.
   *
   * The complaint about this screen has always been its length, and length is
   * only a problem when you cannot see where you stand in it. A tab that still
   * owes something carries a count; a tab that is done carries a tick. The two
   * `later` tabs are excluded on purpose — they are not gaps, they are work
   * that does not exist yet, and counting them would make a record that is
   * ready to open bidding look unfinished.
   *
   * These are ENTRY prerequisites for taking an application and printing a
   * form. The regulatory checks stay where they were, on Review & Publish —
   * this is "have you typed it in", not "is it legal".
   */
  const tabGaps = useMemo(() => {
    const n = (v: string) => { const x = Number(String(v).replace(/[^\d.]/g, '')); return Number.isFinite(x) ? x : 0; };
    // Keys must match the TABS keys above; a mismatch here silently drops a
    // gap into a tab that no longer exists.
    const g: Record<string, string[]> = { basic: [], pricing: [], offer: [], timeline: [], docs: [] };

    if (!form.symbol.trim()) g.basic.push('Symbol');
    if (!form.name.trim()) g.basic.push('IPO name');
    if (!form.exNse && !form.exBse) g.basic.push('at least one exchange');

    if (!n(form.lotSize)) g.pricing.push('Lot size');
    if (!n(form.priceBandMin) && !n(form.finalIssuePrice)) g.pricing.push('a price');
    if (!n(form.faceValue)) g.pricing.push('Face value');

    // offer + anchor are one tab now (2026-09-04), so anchor gaps land in offer
    if (!n(form.issueSizeCr) && form.freshBasis === 'none' && form.ofsBasis === 'none') g.offer.push('the offer size');
    if (!RESV_ROWS.some((r) => form.shareResv[r.key]?.on && n(form.shareResv[r.key].pct) > 0)) g.offer.push('the reservation split');
    // the anchor portion is optional — an issue may simply not have one — so
    // this only complains once the operator has started filling it in
    if (n(form.anchorShares) > 0 && !n(form.anchorPrice)) g.offer.push('the anchor allocation price');
    if (form.anchors.length > 0 && !n(form.anchorPct) && !n(form.anchorShares)) g.offer.push('the anchor portion');

    // timeline + parties are one tab now, so registrar/leads land in timeline
    if (!form.openDate) g.timeline.push('Open date');
    if (!form.closeDate) g.timeline.push('Close date');
    if (!form.registrar.trim()) g.timeline.push('Registrar');
    if (!form.leads.length) g.timeline.push('Lead manager');

    // printing is a first-class flow here, and it cannot run without a blank
    if (form.startPrint && !form.asbaResident && !form.asbaSingle) g.docs.push('a blank ASBA form');

    return g;
  }, [form.symbol, form.name, form.exNse, form.exBse, form.lotSize, form.priceBandMin, form.finalIssuePrice,
      form.faceValue, form.issueSizeCr, form.freshBasis, form.ofsBasis, form.anchorPct, form.anchorShares,
      form.anchorPrice, form.anchors.length, form.openDate, form.closeDate, form.registrar, form.leads.length,
      form.startPrint, form.asbaResident, form.asbaSingle, JSON.stringify(form.shareResv)]);

  /** How many entry prerequisites are still outstanding across the whole form. */
  const gapsLeft = Object.values(tabGaps).reduce((a, v) => a + v.length, 0);

  /** derived row for a reservation key, or undefined when it cannot be computed */
  const derivedRow = (key: string) => derived.primary?.categories.find((c: any) => c.key === key);

  /** The reservation table's Total row — percentages, shares and rupees. */
  const resvTotals = (() => {
    const cats = derived.primary?.categories ?? [];
    const pct = cats.reduce((a: number, c: any) => a + c.pct, 0);
    return {
      pct: Math.round(pct * 1000) / 1000,
      shares: cats.reduce((a: number, c: any) => a + c.shares, 0),
      amount: cats.reduce((a: number, c: any) => a + c.amount, 0),
    };
  })();

  /**
   * The RHP's own sentence, generated rather than typed.
   *
   * Every input for it is already on this tab, so asking an operator to retype
   * it in prose is asking for a fourth place the offer can disagree with
   * itself. A SHARES leg is quoted in shares and an AMOUNT leg in ₹ Cr,
   * because that is the number the prospectus actually commits to.
   */
  const offerRemark = (() => {
    const n = (v: string) => { const x = Number(String(v).replace(/[^\d.]/g, '')); return Number.isFinite(x) ? x : 0; };
    const leg = (basis: string, v: string) => {
      const val = n(v);
      if (basis === 'none' || !val) return null;
      return basis === 'amount'
        ? `up to ₹${val.toLocaleString('en-IN')} Cr`
        : `up to ${val.toLocaleString('en-IN')} equity shares`;
    };
    const fresh = leg(form.freshBasis, form.freshValue);
    const ofs = leg(form.ofsBasis, form.ofsValue);
    const parts: string[] = [];
    if (fresh) parts.push(`Fresh Issue of ${fresh}`);
    if (ofs) parts.push(`Offer for Sale of ${ofs}`);
    return parts.length ? `${parts.join(' and ')}.` : '';
  })();

  /**
   * Blocking checks shown inline — all of them from the ENGINE now.
   *
   * The admin form is not the only writer: the Excel importer and the API both
   * call computeIssue directly, so a rule living in this component is a rule
   * half the callers skip. B01 · B02 · W01 · B09 · B10 are engine rules and the
   * form only renders them.
   *
   * The one check kept locally is B04, as a post-condition. It should be
   * unfalsifiable — Step 3 absorbs the residual, so the sum always reconciles —
   * which is exactly why it is worth asserting rather than assuming.
   */
  const issues = useMemo(() => {
    const out: { code: string; msg: string; blocking: boolean }[] = [];
    for (const p of derived.issues) out.push({ code: p.code, msg: p.message, blocking: p.severity === 'blocking' });
    const sc = derived.primary;
    if (sc) {
      const sum = sc.categories.reduce((a: number, c: any) => a + c.shares, 0);
      if (sum !== sc.netOfferShares) {
        out.push({ code: 'B04', msg: `Category shares total ${sum.toLocaleString('en-IN')} but the net offer is ${sc.netOfferShares.toLocaleString('en-IN')}.`, blocking: true });
      }
    }
    return out;
  }, [derived]);

  /** Fresh + OFS in ₹ Cr, so the operator can see the legs reconcile to the total. */
  const legSumCr = (() => {
    const n = (v: string) => { const x = Number(String(v).replace(/[^\d.]/g, '')); return Number.isFinite(x) ? x : 0; };
    const price = n(form.priceBandMax) || n(form.priceBandMin);
    const leg = (basis: string, v: string) => (basis === 'none' ? 0 : basis === 'amount' ? n(v) : price ? (n(v) * price) / 1e7 : 0);
    const sum = leg(form.freshBasis, form.freshValue) + leg(form.ofsBasis, form.ofsValue);
    return sum > 0 ? sum.toFixed(2) : '';
  })();

  /**
   * ISIN check digit (ISO 6166): expand letters to digits, double alternate
   * digits from the right, sum, and the total must reach the next multiple of
   * ten. A typo in an ISIN otherwise surfaces as a failed exchange bid.
   */
  const isinHint = (() => {
    const v = form.isin.trim().toUpperCase();
    if (!v) return null;
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(v)) return 'Not a valid ISIN shape (2 letters + 9 + check digit).';
    const digits = v.slice(0, 11).split('').map((c) => (/[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55))).join('');
    let sum = 0;
    const rev = digits.split('').reverse();
    for (let i = 0; i < rev.length; i++) {
      let d = Number(rev[i]);
      if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    const check = (10 - (sum % 10)) % 10;
    return check === Number(v[11]) ? 'Checksum valid.' : `Checksum fails — expected ${check} as the last digit.`;
  })();

  const retailCutOffCalc = (() => {
    const max = Number(form.priceBandMax);
    if (!Number.isFinite(max) || max <= 0) return '';
    const disc = Number(form.retailDiscount) || 0;
    return String(Math.max(0, max - disc));
  })();


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

  /*
   * Both guards live HERE, below every hook, and must stay below them.
   *
   * They used to sit above the two useMemo calls (`derived` and `issues`).
   * `loading` starts as `editing`, so opening an existing IPO returned <Loader/>
   * on the first render — those two hooks never ran. When the fetch resolved and
   * loading flipped false, the next render reached them, React counted more
   * hooks than the render before, and the whole screen died with error #310
   * ("Rendered more hooks than during the previous render").
   *
   * It only ever hit Edit: on /catalog/new `editing` is false, so the first
   * render already runs every hook and the counts match.
   */
  if (!operatorCan(me, 'ipos.manage')) return <NoAccess />;
  if (loading) return <Loader />;

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

      {/* Where the record stands, in one line, before the tabs rather than
          after them — an operator should not have to reach Review & Publish to
          find out whether the thing can open bidding. */}
      <div className={`iform-state ${gapsLeft ? 'off' : 'ok'}`}>
        <Icon name={gapsLeft ? 'dot' : 'check'} size={14} />
        {gapsLeft === 0 ? (
          <span>Ready to open bidding and print forms. <b>About Company</b> and <b>After Listing</b> can be filled in later.</span>
        ) : (
          <span>
            <b>{gapsLeft}</b> {gapsLeft === 1 ? 'entry is' : 'entries are'} still needed before this issue can take an application or print a form —{' '}
            {TABS.filter((t) => tabGaps[t.key]?.length).map((t, i, arr) => (
              <span key={t.key}>
                <button type="button" className="iform-jump" onClick={() => setTab(t.key)}>{t.label}</button>
                {i < arr.length - 1 ? ', ' : ''}
              </span>
            ))}.
          </span>
        )}
      </div>

      <div className="card"><div className="card-pad" style={{ paddingBottom: 20 }}>
        <div className="iform-tabs" role="tablist">
          {TABS.map((t) => {
            const gaps = tabGaps[t.key];
            const done = gaps != null && gaps.length === 0;
            return (
              <button key={t.key} role="tab" aria-selected={tab === t.key}
                className={`iform-tab${tab === t.key ? ' on' : ''}`}
                title={gaps?.length ? `Still needed: ${gaps.join(', ')}` : undefined}
                onClick={() => setTab(t.key)}>
                <span className="ic"><Icon name={t.icon} size={16} /></span>{t.label}
                {gaps?.length ? <span className="iform-gap">{gaps.length}</span> : null}
                {done && <span className="iform-ok" aria-label="complete"><Icon name="check" size={12} /></span>}
              </button>
            );
          })}
        </div>

        {/* ================= Basic Details ================= */}
        {tab === 'basic' && (
          <div className="fstack">
            <Panel title="Basic Information">
              <div className="form-grid">
                <Field label="IPO Name / Company" required span={2}><input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Acme Technologies Limited" /></Field>
                <Field label="Symbol" required><input className="input mono" value={form.symbol} onChange={(e) => set({ symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })} placeholder="ACME" /></Field>
                {/* Instrument is NOT the board: an FPO can be Mainboard or SME.
                    Keeping them apart is what makes the FPO report variants
                    possible — before this the four we hold were findable only by
                    searching for "Further Public Offer" inside a text field. */}
                <Field label="Instrument" hint="what kind of offer this is — separate from the board">
                  <select className="input" value={form.instrument} onChange={(e) => set({ instrument: e.target.value })}>
                    <option value="ipo">IPO — Initial Public Offer</option>
                    <option value="fpo">FPO — Further Public Offer</option>
                    <option value="reit">REIT</option>
                    <option value="invit">InvIT</option>
                  </select>
                </Field>
                {/* Two rungs of one classification — see the FormState note. */}
                <Field label="Sector" hint="broad group used for filtering and reports">
                  <SearchSelect
                    options={sectorOpts.filter((o) => o.active).map((o) => ({ value: o.name, label: o.name }))}
                    value={form.sector}
                    onChange={(v) => set({ sector: v })}
                    placeholder="Search sectors…"
                    createLabel={(n) => `+ Add “${n}” as a new sector`}
                    onCreate={async (name) => {
                      try {
                        const row = await api.createMaster('sectors', { name });
                        setSectorOpts((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
                        return row.name;
                      } catch (e: any) { setErr(String(e?.message ?? e)); return null; }
                    }}
                  />
                </Field>
                <Field label="Industry" hint="the exchange's detailed classification, beneath the sector">
                  <input className="input" value={form.industry} placeholder="Specialty Chemicals"
                    onChange={(e) => set({ industry: e.target.value })} />
                </Field>
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
                <Field label="ISIN" hint={isinHint ?? undefined}>
                  <input className="input mono" value={form.isin}
                    onChange={(e) => set({ isin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })}
                    placeholder="INE000000000" />
                </Field>
                <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  <Field label="Face Value (₹)"><input className="input mono" value={form.faceValue} onChange={(e) => set({ faceValue: e.target.value })} placeholder="2.00" /></Field>
                  <Field label="Is Active"><div style={{ paddingTop: 3 }}><Toggle on={isActive} onChange={(v) => set({ status: v ? 'upcoming' : 'withdrawn' })} /></div></Field>
                  {/* Shareholder / Employee quotas are now CARVE-OUT ROWS on the
                      Offer tab — a quota exists because shares are set aside for
                      it, not because a switch was flipped. */}
                  <Field label="Shareholder Allowed"><div style={{ paddingTop: 3 }}><Toggle on={form.allowShareholder} onChange={(v) => set({ allowShareholder: v })} /></div></Field>
                  <Field label="Employee Allowed"><div style={{ paddingTop: 3 }}><Toggle on={form.allowEmployee} onChange={(v) => set({ allowEmployee: v })} /></div></Field>
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  <Field label="Start Bid" hint="ON → investors can apply / pre-apply. OFF → Apply hidden on site & app."><div style={{ paddingTop: 3 }}><Toggle on={form.startBid} onChange={(v) => set({ startBid: v })} /></div></Field>
                  <Field label="Start Printing" hint="ON → prefilled ASBA form printing available. OFF → print hidden."><div style={{ paddingTop: 3 }}><Toggle on={form.startPrint} onChange={(v) => set({ startPrint: v })} /></div></Field>
                  {/* Which exchanges this issue lists on — CHOSEN, not inferred.
                      The API used to write ['NSE','BSE'] for every mainboard issue
                      and both SME platforms for every SME one, so an issue on a
                      single platform was recorded as listing on two. */}
                  <Field label={form.type === 'sme' ? 'NSE SME' : 'NSE'} hint="listed on this exchange">
                    <div style={{ paddingTop: 3 }}><Toggle on={form.exNse} onChange={(v) => set({ exNse: v })} /></div>
                  </Field>
                  <Field label={form.type === 'sme' ? 'BSE SME' : 'BSE'} hint={form.type === 'sme' ? 'SME usually lists on ONE platform' : 'listed on this exchange'}>
                    <div style={{ paddingTop: 3 }}><Toggle on={form.exBse} onChange={(v) => set({ exBse: v })} /></div>
                  </Field>
                  {editing && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <Field label="Live subscription">
                        <div style={{ paddingTop: 3, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <Toggle on={form.autoPollSubscription} onChange={(v) => set({ autoPollSubscription: v })} />
                          <button type="button" className="btn btn-secondary btn-sm" onClick={refreshSub}><Icon name="refresh" size={13} /> Refresh now</button>
                          {subMsg && <span className="muted" style={{ fontSize: 12 }}>{subMsg}</span>}
                        </div>
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            </Panel>

            {/* Pricing moved to its own tab — Reservation cannot be derived
                without the lot size and the price scenarios, so pricing has to
                come first (spec §8). */}


          </div>
        )}

        {/* ================= Shares & Reservation ================= */}
        {tab === 'pricing' && (
          <div className="fstack">
            <Panel title="Price & lot" desc="The reservation split cannot be derived without these, which is why pricing comes before it.">
              <div className="form-grid">
                <Field label="Mechanism" required>
                  <select className="input" value={form.mechanism} onChange={(e) => set({ mechanism: e.target.value })}>
                    <option value="book_built">Book-built</option>
                    <option value="fixed_price">Fixed price</option>
                  </select>
                </Field>
                <Field label="Lot Size" required hint="shares per application lot">
                  <input className="input mono" value={form.lotSize} onChange={(e) => set({ lotSize: e.target.value })} placeholder="1" />
                </Field>
                <Field label={form.mechanism === 'fixed_price' ? 'Issue price (₹)' : 'Price band — min (₹)'}>
                  <input className="input mono" value={form.priceBandMin} onChange={(e) => set({ priceBandMin: e.target.value })} />
                </Field>
                <Field label="Price band — max (₹)" hint={form.mechanism === 'fixed_price' ? 'not used for a fixed-price issue' : undefined}>
                  <input className="input mono" value={form.priceBandMax} disabled={form.mechanism === 'fixed_price'} onChange={(e) => set({ priceBandMax: e.target.value })} />
                </Field>
                <Field label="Tick size (₹)"><input className="input mono" value={form.tickSize} onChange={(e) => set({ tickSize: e.target.value })} placeholder="1" /></Field>
                <Field label="Final issue price (₹)" hint="set after the book closes; becomes the displayed scenario">
                  <input className="input mono" value={form.finalIssuePrice} onChange={(e) => set({ finalIssuePrice: e.target.value })} />
                </Field>
              </div>
            </Panel>

            <Panel title="Discounts" desc="Per-category discount off the offer price. Each lowers that category's minimum application.">
              <div className="form-grid">
                <Field label="Retail (₹)"><input className="input mono" value={form.retailDiscount} onChange={(e) => set({ retailDiscount: e.target.value })} /></Field>
                <Field label="Employee (₹)"><input className="input mono" value={form.employeeDiscount} onChange={(e) => set({ employeeDiscount: e.target.value })} /></Field>
                <Field label="Shareholder (₹)"><input className="input mono" value={form.shareholderDiscount} onChange={(e) => set({ shareholderDiscount: e.target.value })} /></Field>
                <Field label="Retail cut-off (₹)" hint="derived: max band − retail discount">
                  <input className="input mono" readOnly style={{ background: 'var(--bg-subtle)' }} value={retailCutOffCalc} />
                </Field>
              </div>
            </Panel>

          </div>
        )}
        {tab === 'offer' && (
          <div className="fstack">
            <Panel title="Offer structure" desc="What is being offered, and under which regulation. These four inputs drive every derived figure below.">
              <div className="form-grid">
                <Field label="Mechanism">
                  <select className="input" value={form.mechanism} onChange={(e) => set({ mechanism: e.target.value })}>
                    <option value="book_built">Book-built</option>
                    <option value="fixed_price">Fixed price</option>
                  </select>
                </Field>
                <Field label="Regulation basis" hint={`auto: ${derived.rulePack.label}`}>
                  <select className="input" value={form.regulationBasis} onChange={(e) => set({ regulationBasis: e.target.value })}>
                    <option value="">Auto — from the QIB %</option>
                    <option value="icdr_6_1">ICDR 6(1) — QIB up to 50%</option>
                    <option value="icdr_6_2">ICDR 6(2) — QIB at least 75%</option>
                  </select>
                </Field>
                <Field label="Fresh issue" hint="new shares issued by the company">
                  <div className="leg-split">
                    <select className="input" value={form.freshBasis} onChange={(e) => set({ freshBasis: e.target.value })}>
                      <option value="none">Not set</option><option value="amount">₹ Cr</option><option value="shares">Shares</option>
                    </select>
                    <input className="input mono" value={form.freshValue} disabled={form.freshBasis === 'none'}
                      onChange={(e) => set({ freshValue: e.target.value.replace(/[^\d.]/g, '') })} />
                  </div>
                </Field>
                <Field label="Offer for sale" hint="existing shares sold by shareholders">
                  <div className="leg-split">
                    <select className="input" value={form.ofsBasis} onChange={(e) => set({ ofsBasis: e.target.value })}>
                      <option value="none">Not set</option><option value="amount">₹ Cr</option><option value="shares">Shares</option>
                    </select>
                    <input className="input mono" value={form.ofsValue} disabled={form.ofsBasis === 'none'}
                      onChange={(e) => set({ ofsValue: e.target.value.replace(/[^\d.]/g, '') })} />
                  </div>
                </Field>
              </div>
              {form.freshBasis === 'none' && form.ofsBasis === 'none' && (
                <p className="hint" style={{ marginTop: 6 }}>
                  Until one of these is set, the public detail page shows a Fresh / OFS split
                  <b> estimated at 85 / 15</b> rather than the real one.
                </p>
              )}
            </Panel>
            {/* The "Shares Size Info" grid is gone (brief §3: DROP). Its share
                counts and ₹Cr columns were typed by hand beside the percentages
                they are computed from; they are now the derived panel below.
                Its NCD / IND / HNI columns were debt-issue fields that belong on
                an NCD form, not here. */}
            {/* ONE issue size, not two.
                This panel used to show a typed "Total issue size" beside a
                derived "Fresh + OFS", with nothing saying which was
                authoritative — and the typed one carried a placeholder of 290,
                which read as a computed total for every issue that was not
                MVELECTRO. Enter the legs and the total is derived from them;
                the manual box appears only when there are no legs to derive
                from, which is how the legacy records were entered. */}
            <Panel title="Offer size" desc="Derived from the Fresh Issue and Offer for Sale legs above.">
              <div className="form-grid">
                {legSumCr ? (
                  <Field label="Total issue size (₹ Cr)" hint="derived from the two legs above">
                    <input className="input mono" readOnly style={{ background: 'var(--bg-subtle)' }} value={legSumCr} />
                  </Field>
                ) : (
                  <Field label="Total issue size (₹ Cr)" required
                    hint="no Fresh / OFS legs entered — enter the total the RHP states">
                    <input className="input mono" value={form.issueSizeCr}
                      onChange={(e) => set({ issueSizeCr: e.target.value.replace(/[^\d.]/g, '') })} />
                  </Field>
                )}
                {/* The count the offer document actually prints, and the one
                    every category divides out of. A ₹ total only approximates
                    it — it is rounded to two decimals in Cr, and the price is
                    a guess until the issue prices. */}
                <Field label="Total issue size (shares)"
                  hint="as the offer document states it — this figure wins over the ₹ total">
                  <input className="input mono" value={form.totalShares} placeholder="1,76,47,058"
                    onChange={(e) => set({ totalShares: e.target.value.replace(/[^\d]/g, '') })} />
                </Field>
                {form.totalShares && derived.primary && (
                  <Field label="Implied at this price" hint="derived — the ₹ value of the stated count">
                    <input className="input mono" readOnly style={{ background: 'var(--bg-subtle)' }}
                      value={`₹${((Number(form.totalShares) * derived.primary.price) / 1e7).toFixed(2)} Cr @ ₹${derived.primary.price}`} />
                  </Field>
                )}
              </div>
            </Panel>
            <Panel title="Minimum subscription" desc="Below this the issue must be withdrawn and every application refunded.">
              <div className="form-grid">
                <Field label="Minimum subscription (% of fresh issue)" hint="90% under ICDR unless the RHP says otherwise">
                  <input className="input mono" value={form.minSubscriptionPct} placeholder="90"
                    onChange={(e) => set({ minSubscriptionPct: e.target.value.replace(/[^\d.]/g, '') })} />
                </Field>
              </div>
            </Panel>
            <Panel title="Carve-outs" desc="Shares set aside off the top, before the category split — enter ₹ Cr. A quota exists because shares are reserved for it.">
              <div className="form-grid">
                <Field label="Employee (₹ Cr)">
                  <input className="input mono" value={form.cvEmployee} onChange={(e) => set({ cvEmployee: e.target.value.replace(/[^\d.]/g, '') })} />
                </Field>
                {/* Both are per-APPLICANT rupee caps from the RHP, not sizes of
                    the quota: an employee may bid up to the max, of which only
                    the initial amount is allotted before any scale-down. */}
                <Field label="Employee cap per applicant (₹)" hint="RHP states it; ₹5,00,000 is the usual ceiling">
                  <input className="input mono" value={form.empMaxPerApplicant} onChange={(e) => set({ empMaxPerApplicant: e.target.value.replace(/[^\d]/g, '') })} />
                </Field>
                <Field label="Employee initial allotment cap (₹)" hint="usually ₹2,00,000">
                  <input className="input mono" value={form.empInitialPerApplicant} onChange={(e) => set({ empInitialPerApplicant: e.target.value.replace(/[^\d]/g, '') })} />
                </Field>
                <Field label="Shareholder (₹ Cr)">
                  <input className="input mono" value={form.cvShareholder} onChange={(e) => set({ cvShareholder: e.target.value.replace(/[^\d.]/g, '') })} />
                </Field>
                {/* Mainboard issues have no market maker, so the field only
                    appears where it is required — and where leaving it empty
                    is a blocking fault (B18). */}
                {form.type === 'sme' && (
                  <Field label="Market maker (₹ Cr)" required
                    hint={`SME issues must reserve at least ${derived.rulePack.marketMakerMinPct}% of the issue`}>
                    <input className="input mono" value={form.cvMarketMaker} onChange={(e) => set({ cvMarketMaker: e.target.value.replace(/[^\d.]/g, '') })} />
                  </Field>
                )}
              </div>
            </Panel>

            <Panel title="Share Reservation" desc="Enter each category's percentage of the NET offer. Everything to the right is derived — HNI (Big) takes the larger two-thirds of the NII quota.">
              {/* SEBI splits the NII quota two-thirds to bids above ₹10 L (Big) and
                  one-third to ₹2–10 L (Small), so Big is ALWAYS the larger share.
                  Three live records had the two transposed, which fed wrong
                  "applications for 1×" figures to the public site — the numbers
                  still add to 100%, so nothing else catches it. A warning, not a
                  block: the operator may be entering a genuinely unusual issue. */}
              {issues.length > 0 && (
                <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {issues.map((v: { code: string; msg: string; blocking: boolean }) => (
                    <div key={v.code + v.msg} className={`banner ${v.blocking ? 'warn' : 'info'}`}>
                      <b>{v.blocking ? 'Fix before publishing' : 'Check'}:</b> {v.msg}
                    </div>
                  ))}
                </div>
              )}
              {/* the derived total, so the operator can see the split resolve live */}
              {derived.primary && (
                <div className="rc-summary">
                  <span><i>Net offer</i>{derived.primary.netOfferShares.toLocaleString('en-IN')} sh</span>
                  <span><i>At</i>₹{derived.primary.price}</span>
                  {derived.primary.residualTo && (
                    <span><i>Residual</i>{derived.primary.residualLots} lot{derived.primary.residualLots === 1 ? '' : 's'} → {CATEGORY_LABELS[derived.primary.residualTo] ?? derived.primary.residualTo}</span>
                  )}
                  <span className="muted">{derived.rulePack.label}</span>
                </div>
              )}
              <div style={{ overflowX: 'auto' }}>
                <table className="table resv-table" style={{ width: '100%' }}>
                  <thead><tr><th style={{ width: 40 }} /><th>Category</th><th className="r">Share (%)</th><th className="r">Share Count</th><th className="r">Amount Reserved</th><th className="r">Forms required for 1X</th></tr></thead>
                  <tbody>
                    {RESV_ROWS.map((r) => (
                      <tr key={r.key} className={form.shareResv[r.key].on ? 'row-on' : ''}>
                        <td style={{ textAlign: 'center' }}><input type="checkbox" checked={form.shareResv[r.key].on} onChange={(e) => setResv(r.key, { on: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} /></td>
                        <td style={{ fontWeight: 600, fontSize: 12.5 }}>{r.label}</td>
                        <td><input className="input mono" value={form.shareResv[r.key].pct} onChange={(e) => setResv(r.key, { pct: e.target.value })} /></td>
                        {/* Share Count · Category Remark · Require for 1X are now
                            PROJECTIONS of the percentage beside them. They used to be
                            typed by hand, which is how a record could publish a share
                            count that disagreed with its own percentage. */}
                        {(() => {
                          const d = derivedRow(r.key);
                          const dash = <span className="muted">—</span>;
                          return (
                            <>
                              <td className="rc-derived r">{d ? d.shares.toLocaleString('en-IN') : dash}</td>
                              <td className="rc-derived r">{d ? `₹${(d.amount / 1e7).toFixed(2)} Cr` : dash}</td>
                              <td className="rc-derived r">
                                {d?.appsFor1x != null
                                  ? <>{d.appsFor1x.toLocaleString('en-IN')}<i title="Applications that can be allotted at 1x — capacity, not demand"> · {d.maxAllottees!.toLocaleString('en-IN')} allottees</i></>
                                  : dash}
                              </td>
                            </>
                          );
                        })()}
                      </tr>
                    ))}
                    {/* The total is the check an operator actually runs: does the
                        split add back up to the offer? Reading it off four rows
                        by eye is exactly how a 100.691% table shipped. */}
                    {derived.primary && (
                      <tr className="resv-total">
                        <td />
                        <td style={{ fontWeight: 700 }}>Total</td>
                        <td className="r mono" style={{ fontWeight: 700 }}>{resvTotals.pct}</td>
                        <td className="r mono" style={{ fontWeight: 700 }}>{resvTotals.shares.toLocaleString('en-IN')}</td>
                        <td className="r mono" style={{ fontWeight: 700 }}>₹{(resvTotals.amount / 1e7).toFixed(2)} Cr</td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {!derived.primary && (
                <div className="banner info" style={{ fontSize: 13, marginTop: 12 }}>{derivedBlockedWhy}</div>
              )}
              {/* Generated from the offer legs, not typed. It is the RHP's own
                  sentence and every input for it is already on this tab. */}
              <div className="form-grid one" style={{ marginTop: 12 }}>
                <Field label="Remarks" hint="derived from the offer structure">
                  <input className="input" readOnly style={{ background: 'var(--bg-subtle)' }}
                    value={offerRemark} placeholder="Enter the Fresh Issue / Offer for Sale legs above" />
                </Field>
              </div>
            </Panel>

            {/* Anchor moved into this tab (2026-09-04): it is a sub-allocation
                of the QIB quota, and reading the roster against the total it
                comes out of was the point of the merge. */}
            <Panel title="Anchor portion" desc="A sub-allocation of the QIB quota above, not a category of its own — which is why it is not a row in the reservation table.">
              <div className="form-grid">
                <Field label="Anchor (% of QIB)" hint={`${derived.rulePack.label} caps this at ${derived.rulePack.anchorMaxPctOfQib ?? '—'}%`}>
                  <input className="input mono" value={form.anchorPct} placeholder="60"
                    onChange={(e) => set({ anchorPct: e.target.value.replace(/[^\d.]/g, '') })} />
                </Field>
                <Field label="Anchor shares reserved" hint="derived — the portion, at the price above">
                  <input className="input mono" readOnly style={{ background: 'var(--bg-subtle)' }}
                    value={derived.primary?.anchor ? derived.primary.anchor.shares.toLocaleString('en-IN') : ''} />
                </Field>
                <Field label="Net QIB after anchor" hint="derived">
                  <input className="input mono" readOnly style={{ background: 'var(--bg-subtle)' }}
                    value={derived.primary?.anchor ? derived.primary.anchor.netQibShares.toLocaleString('en-IN') : ''} />
                </Field>
                {/* The book as ALLOTTED, off the anchor intimation. Two inputs
                    and not one, because the count only means anything beside
                    the price it struck: the reserved portion is fixed in ₹, so
                    ESDS reserves 52,94,116 at ₹408 and allots 50,34,964 at
                    ₹429 — the same ₹216 Cr. Comparing the counts alone reads
                    as a 4.9% shortfall that is not there. */}
                <Field label="Anchor shares allotted" hint="anchor intimation — what the book actually took">
                  <input className="input mono" value={form.anchorShares} placeholder="50,34,964"
                    onChange={(e) => set({ anchorShares: e.target.value.replace(/[^\d]/g, '') })} />
                </Field>
                <Field label="Anchor allocation price (₹)" hint="the price the anchor book struck — need not be the issue price">
                  <input className="input mono" value={form.anchorPrice} placeholder="429"
                    onChange={(e) => set({ anchorPrice: e.target.value.replace(/[^\d.]/g, '') })} />
                </Field>
                <Field label="Anchor amount allotted" hint="derived — shares × allocation price">
                  <input className="input mono" readOnly style={{ background: 'var(--bg-subtle)' }}
                    value={derived.primary?.anchor?.allocatedAmount
                      ? `₹${(derived.primary.anchor.allocatedAmount / 1e7).toFixed(2)} Cr` : ''} />
                </Field>
                <Field label="MF share of anchor (%)" hint={`${derived.rulePack.anchorMfPct}% by default — a third of the anchor book`}>
                  <input className="input mono" value={form.anchorMfPct} placeholder={String(derived.rulePack.anchorMfPct)}
                    onChange={(e) => set({ anchorMfPct: e.target.value.replace(/[^\d.]/g, '') })} />
                </Field>
                {/* Two DIFFERENT mutual-fund figures, which is why both are
                    shown: a third of the anchor book, and 5% of what is left of
                    QIB once the anchor is taken out. */}
                <Field label="Anchor MF shares" hint="derived">
                  <input className="input mono" readOnly style={{ background: 'var(--bg-subtle)' }}
                    value={derived.primary?.anchor ? derived.primary.anchor.anchorMfShares.toLocaleString('en-IN') : ''} />
                </Field>
                <Field label="QIB MF shares (post-anchor)" hint="derived">
                  <input className="input mono" readOnly style={{ background: 'var(--bg-subtle)' }}
                    value={derived.primary?.anchor ? derived.primary.anchor.qibMfShares.toLocaleString('en-IN') : ''} />
                </Field>
                <Field label="Lock-in tranche 1 (%)" hint="usually 50%"><input className="input mono" value={form.lockin1Pct} placeholder="50" onChange={(e) => set({ lockin1Pct: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
                <Field label="Tranche 1 lock-in (days)" hint="usually 30"><input className="input mono" value={form.lockin1Days} placeholder="30" onChange={(e) => set({ lockin1Days: e.target.value.replace(/[^\d]/g, '') })} /></Field>
                <Field label="Tranche 2 lock-in (days)" hint="usually 90"><input className="input mono" value={form.lockin2Days} placeholder="90" onChange={(e) => set({ lockin2Days: e.target.value.replace(/[^\d]/g, '') })} /></Field>
              </div>
            </Panel>

            {/* Sits directly under the portion it is allotted out of: the tally
                below compares the two, which it could not do while the roster
                lived over on About Company. */}
            <Panel title="Anchor investors" desc="From the anchor intimation. Pick the name from the Anchor Investors master, then enter what that investor was allotted. Shown on the public detail page.">
              <div className="row" style={{ gap: 8, marginBottom: form.anchors.length ? 12 : 4 }}>
                <select
                  className="input" style={{ maxWidth: 340 }} value=""
                  onChange={(e) => {
                    const n = e.target.value;
                    if (n && !form.anchors.some((a) => a.name === n)) set({ anchors: [...form.anchors, { name: n, shares: '', pct: '', amount: '' }] });
                  }}
                >
                  <option value="">+ Add anchor…</option>
                  {anchorOpts.filter((o) => o.active && !form.anchors.some((a) => a.name === o.name)).map((o) => (
                    <option key={o.id} value={o.name}>{o.name}{o.type ? ` — ${o.type}` : ''}</option>
                  ))}
                </select>
                {anchorOpts.length === 0 && <span className="muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>Master empty — add rows in Masters → Anchor Investors.</span>}
              </div>
              {form.anchors.length > 0 && (
                <div className="anchor-row anchor-head">
                  <span className="anchor-name">Investor</span>
                  <span>Shares</span><span>% of portion</span><span>Amount</span><span />
                </div>
              )}
              {form.anchors.map((a, i) => {
                const upd = (patch: Partial<typeof a>) =>
                  set({ anchors: form.anchors.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <div className="anchor-row" key={a.name}>
                    <span className="anchor-name">{a.name}</span>
                    <input className="input mono" placeholder="10,25,644" value={a.shares}
                      onChange={(e) => upd({ shares: e.target.value.replace(/[^\d]/g, '') })} />
                    <input className="input mono" placeholder="20.37" value={a.pct}
                      onChange={(e) => upd({ pct: e.target.value.replace(/[^\d.]/g, '') })} />
                    <input className="input mono" placeholder="₹44.00 Cr" value={a.amount}
                      onChange={(e) => upd({ amount: e.target.value })} />
                    <button type="button" className="icon-btn danger" title="Remove"
                      onClick={() => set({ anchors: form.anchors.filter((_, j) => j !== i) })}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                );
              })}
              {anchorRoster && (
                <p className={`anchor-tally ${anchorRoster.ok ? 'ok' : 'off'}`}>{anchorRoster.text}</p>
              )}
            </Panel>
          </div>
        )}

        {/* ================= Timeline ================= */}
        {tab === 'timeline' && (
          <div className="fstack">
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
                {/* The deadline that actually bites on the last day: a mandate
                    not confirmed by the cut-off is not a valid application. */}
                <Field label="UPI mandate cut-off (date & time)" hint="last moment an investor can confirm the mandate">
                  <input type="datetime-local" className="input mono" value={form.upiMandateCutoff} onChange={(e) => set({ upiMandateCutoff: e.target.value })} />
                </Field>
                {/* Named on the offer document beside the cut-off, and the two
                    belong together: this is the bank the mandate is raised on. */}
                <Field label="Sponsor bank(s)" hint="warehouses the UPI mandates for this issue — comma-separated">
                  <input className="input" value={form.sponsorBank} placeholder="Axis Bank, ICICI Bank"
                    onChange={(e) => set({ sponsorBank: e.target.value })} />
                </Field>
              </div>
            </Panel>

            {/* Intermediaries moved into this tab (2026-09-04). Dates and the
                people involved sit together in the operator's head. */}
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

        {/* ================= About Company ================= */}
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
          const slot = (key: 'asbaResident' | 'asbaSyndicate' | 'asbaSingle' | 'asbaShareholder', label: string, hint: string) => (
            // stacked layout: label+hint on their own line — no fixed column, nothing overlaps
            <div className="doc-up asba">
              <div className="doc-lbl">{label}<span className="hint-line">{hint}</span></div>
              <div className="doc-row">
                <div className="doc-file">{form[key] ? <><Icon name="doc" size={15} /> <span className="mono" style={{ fontSize: 12.5 }}>{(form[(key + 'Name') as keyof FormState] as string) || 'form.pdf'}</span></> : <span className="muted" style={{ fontSize: 13 }}>Not uploaded</span>}</div>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  {asbaBusy === key ? 'Uploading…' : form[key] ? 'Replace' : <><Icon name="upload" size={14} /> Upload PDF</>}
                  <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => onAsbaFile(key, e.target.files?.[0])} />
                </label>
                {form[key] && <button type="button" className="icon-btn danger" onClick={() => set({ [key]: '', [key + 'Name']: '' } as Partial<FormState>)} title="Remove"><Icon name="trash" size={15} /></button>}
              </div>
            </div>
          );
          return (
            // spaced below the Documents card (the two panels were touching)
            <div style={{ marginTop: 18 }}>
              <Panel title="ASBA Print Forms" desc="Blank bid-cum-application PDFs — the system overlays applicant data for the 'apply through bank' print feature.">
                <div className="lead-list">
                  {isMainboard ? <>
                    {slot('asbaResident', 'Resident form', 'Used for bids up to ₹5,00,000 · SYMBOL.pdf')}
                    {slot('asbaSyndicate', 'Syndicate ASBA form', 'Used for bids above ₹5,00,000 · SYMBOL_SA.pdf')}
                  </> : slot('asbaSingle', 'Application form', 'Used for all bid amounts (SME)')}
                  {form.allowShareholder && slot('asbaShareholder', 'Shareholder form', 'Used for the shareholder category (≤ ₹2,00,000) · SYMBOL_SHA.pdf')}
                </div>
              </Panel>
            </div>
          );
        })()}

        {/* ================= IPO Application Series ================= */}
        {tab === 'docs' && (
          <div className="fstack">
            {seriesPanel('Application Series — PDF Printing', 'Ranges per syndicate member; the active one is used for prefilled-ASBA PDF printing.', 'pdfSeries', 'pdfActive')}
            {seriesPanel('Application Series — Online Apply', 'Ranges per syndicate member; the active one is used for online applications.', 'onlineSeries', 'onlineActive')}
          </div>
        )}

        {/* ================= After Listing ================= */}
        {/* Last, because none of it exists yet while the issue is being set up.
            This used to sit inside Pricing, three tabs before the dates it
            depends on had even been entered. */}
        {/* ================= Review & Publish ================= */}
        {tab === 'review' && (
          <div className="fstack">
            {/* Every blocking rule in one place. They surface inline on their
                own tabs too, but a rule you have to go looking for is a rule
                that gets missed — this is the last screen before Save. */}
            <Panel title="Checks" desc="Blocking items must be fixed before this issue is fit to publish. Warnings are worth a look but do not stop you.">
              {issues.length === 0 ? (
                <div className="banner ok" style={{ fontSize: 13.5, margin: 0 }}>
                  <b>All checks pass.</b> Nothing is blocking publication.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {issues.map((v: { code: string; msg: string; blocking: boolean }) => (
                    <div key={v.code + v.msg} className={`banner ${v.blocking ? 'warn' : 'info'}`} style={{ fontSize: 13.5 }}>
                      <b>{v.code}</b> · {v.blocking ? 'Blocking' : 'Warning'} — {v.msg}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="The issue" desc="What this record says, read back. Everything below is derived — if a figure looks wrong, the input behind it is wrong.">
              <div className="form-grid">
                <Field label="Issue"><input className="input" readOnly style={{ background: 'var(--bg-subtle)' }} value={`${form.symbol || '—'} · ${form.name || '—'}`} /></Field>
                <Field label="Board & mechanism"><input className="input" readOnly style={{ background: 'var(--bg-subtle)' }} value={`${form.type === 'sme' ? 'SME' : 'Mainboard'} · ${form.mechanism === 'fixed_price' ? 'Fixed price' : 'Book-built'}`} /></Field>
                <Field label="Rule pack" hint="selected by board + mechanism + regulation basis">
                  <input className="input" readOnly style={{ background: 'var(--bg-subtle)' }} value={derived.rulePack.label} />
                </Field>
              </div>
              {derived.primary ? (
                <>
                  <div className="rc-summary" style={{ marginTop: 12 }}>
                    <span><i>At</i>₹{derived.primary.price}</span>
                    <span><i>Total offer</i>{derived.primary.totalOfferShares.toLocaleString('en-IN')} sh</span>
                    <span><i>Net offer</i>{derived.primary.netOfferShares.toLocaleString('en-IN')} sh</span>
                    <span><i>Issue size</i>₹{(derived.primary.totalOfferAmount / 1e7).toFixed(2)} Cr</span>
                    {derived.primary.anchor && <span><i>Anchor</i>{derived.primary.anchor.shares.toLocaleString('en-IN')} sh</span>}
                  </div>
                  <div style={{ overflowX: 'auto', marginTop: 12 }}>
                    <table className="table" style={{ width: '100%' }}>
                      <thead><tr><th>Category</th><th className="r">Share (%)</th><th className="r">Share Count</th><th className="r">Amount Reserved</th><th className="r">Forms required for 1X</th></tr></thead>
                      <tbody>
                        {derived.primary.categories.map((c: any) => (
                          <tr key={c.key}>
                            <td style={{ fontWeight: 600 }}>{c.label}</td>
                            <td className="r mono">{c.pct}</td>
                            <td className="r mono">{c.shares.toLocaleString('en-IN')}</td>
                            <td className="r mono">₹{(c.amount / 1e7).toFixed(2)} Cr</td>
                            <td className="r mono">{c.appsFor1x != null ? c.appsFor1x.toLocaleString('en-IN') : <span className="muted">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="banner info" style={{ fontSize: 13, marginTop: 12 }}>{derivedBlockedWhy}</div>
              )}
            </Panel>

            {/* About Company + After Listing moved here (2026-09-04) as
                collapsible sections. Both fill the public detail page but
                block nothing operational, so keeping them out of the primary
                flow matches the operator's own "we can add the details later". */}
            <details className="iform-optional">
              <summary><span>About Company</span><span className="iform-opt-hint">optional — fills the public detail page</span></summary>
              <div className="fstack" style={{ marginTop: 12 }}>
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
            </details>

            <details className="iform-optional">
              <summary><span>After Listing</span><span className="iform-opt-hint">filled once the registrar and the exchanges publish</span></summary>
              <div className="fstack" style={{ marginTop: 12 }}>
            <Panel title="After the issue"
              desc="Filled once the registrar and the exchanges publish. Nothing here is needed to open bidding or print a form.">
              <div className="form-grid">
                <Field label="Applications received" hint="what the registrar reported — NOT applications for 1×, which the engine derives on Review & Publish">
                  <input className="input mono" value={form.applicationsReceived} onChange={(e) => set({ applicationsReceived: e.target.value.replace(/\D/g, '') })} />
                </Field>
                <Field label="NSE listing price (₹)" hint="the price it opened at on listing day">
                  <input className="input mono" value={form.nseListingPrice} onChange={(e) => set({ nseListingPrice: e.target.value })} />
                </Field>
                <Field label="BSE listing price (₹)" hint="the price it opened at on listing day">
                  <input className="input mono" value={form.bseListingPrice} onChange={(e) => set({ bseListingPrice: e.target.value })} />
                </Field>
              </div>
              {/* Final issue price is NOT repeated here. It lives on Pricing,
                  and one value behind two controls is how the two drift apart
                  in an operator's head. */}
            </Panel>
              </div>
            </details>

            <Panel title="Publishing" desc="Whether the issue is visible, and which flows are open on it.">
              <div className="form-grid">
                <Field label="Visible on the site"><div style={{ paddingTop: 3 }}><Toggle on={isActive} onChange={(v) => set({ status: v ? 'upcoming' : 'withdrawn' })} /></div></Field>
                <Field label="Apply (UPI)"><div style={{ paddingTop: 3 }}><Toggle on={form.startBid} onChange={(v) => set({ startBid: v })} /></div></Field>
                <Field label="Print forms"><div style={{ paddingTop: 3 }}><Toggle on={form.startPrint} onChange={(v) => set({ startPrint: v })} /></div></Field>
              </div>
              {issues.some((v: { blocking: boolean }) => v.blocking) && (
                <div className="banner warn" style={{ fontSize: 13, marginTop: 12 }}>
                  This issue has blocking checks outstanding. These three toggles stay under
                  your control by design — nothing here overrides you — but the figures this
                  issue publishes will be wrong until the checks above are fixed.
                </div>
              )}
            </Panel>
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
