import * as st from '@investoyard/shared-types';
import type { RawIpo } from './data.server';
import {
  crore, dateRange, dayMon, dayMonYear, initials, inr, logWidth, priceBand, rupees, times, wdDayMon, yearOf,
} from './format';

/*
 * VIEW MODELS — the one place a raw API record becomes something a page shows.
 *
 * Every variant renders these and only these, which is what lets five variants
 * look nothing alike while agreeing on every number. Every figure is derived
 * through the same shared-types functions apps/web uses (subscriptionTable,
 * reservation, lotLadder, timeline, stageOf), so a partner site can never
 * disagree with investoyard.com about an issue.
 *
 * A figure the record does not carry is null / '—'. Nothing is invented.
 */

const ORDER = ['upcoming', 'open', 'closed', 'listed'];
const d10 = (s?: string | null) => (s || '').slice(0, 10);
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** The status column is dead; status is derived from the dates, exactly as apps/web does. */
export function normalise(ipo: RawIpo): RawIpo {
  const day = st.istToday();
  const o = d10(ipo.openDate);
  const c = d10(ipo.closeDate);
  const l = d10(ipo.listingDate);
  let derived = 'upcoming';
  if (l && day >= l) derived = 'listed';
  else if (c && day > c) derived = 'closed';
  else if (o && day >= o) derived = 'open';
  const status = ipo.status === 'withdrawn' ? 'withdrawn' : ORDER.indexOf(derived) > ORDER.indexOf(ipo.status) ? derived : ipo.status;
  return { ...ipo, status, openDate: o, closeDate: c, listingDate: l, allotmentDate: d10(ipo.allotmentDate) };
}

export type Tone = 'open' | 'upcoming' | 'closed';

export interface IpoCard {
  sym: string;
  id: string;
  name: string;
  legal: string;
  board: 'Mainboard' | 'SME';
  exchanges: string;
  logo: string | null;
  ini: string;
  stage: string;
  tone: Tone;
  status: string;
  dates: string;
  band: string;
  min: string;
  size: string;
  subs: string | null;
  subsN: number | null;
  bar: number;
  /** Per-category multiples, for variants that show a matrix. Null when not subscribed yet. */
  qibN: number | null;
  niiN: number | null;
  retailN: number | null;
  /** Numeric forms, so a table can sort by value rather than by the formatted string. */
  sizeN: number | null;
  minN: number | null;
  bandHi: number | null;
  open: string;
  close: string;
  listing: string;
  allotment: string;
  year: number | null;
  href: string;
  /** Sector line under the name, as the operator entered it. Null when not entered. */
  industry: string | null;
  /** "34 shares", or '—'. */
  lot: string;
  /** Direct links to the offer documents when the record carries them. */
  rhp: string | null;
  drhp: string | null;
  registrar: string | null;
  /** "Fresh + OFS", "Fresh issue" or "Offer for sale", from the offer legs; '—' when neither is entered. */
  issueType: string;
  /** The first sentence or two of the company description, as plain text, for a hero or a header. */
  blurb: string | null;
}

const OPEN_STAGES = ['live', 'opentoday', 'closingtoday'];

function statusText(ipo: RawIpo, stage: string): string {
  switch (stage) {
    case 'upcoming':
    case 'preapply':
      return ipo.openDate ? `Opens ${wdDayMon(ipo.openDate)}` : 'Opening soon';
    case 'opentoday':
    case 'live':
      return `Open · closes ${wdDayMon(ipo.closeDate)}`;
    case 'closingtoday':
      return 'Closes today';
    case 'awaiting':
      return ipo.allotmentDate ? `Allotment ${wdDayMon(ipo.allotmentDate)}` : 'Bidding closed';
    case 'allotmentout':
      return ipo.listingDate ? `Lists ${wdDayMon(ipo.listingDate)}` : 'Allotment out';
    case 'listed':
      return ipo.listingDate ? `Listed ${dayMon(ipo.listingDate)}` : 'Listed';
    case 'withdrawn':
      return 'Withdrawn';
    default:
      return st.stageLabel(ipo as any);
  }
}

export function minInvestment(ipo: RawIpo): number | null {
  const lot = num(ipo.lotSize);
  const hi = num(ipo.priceBandMax) ?? num(ipo.priceBandMin);
  if (!lot || !hi) return null;
  // An SME individual applies for a fixed two lots (post-2024 ICDR); mainboard retail starts at one.
  return lot * hi * (ipo.type === 'sme' ? 2 : 1);
}

export function totalTimes(ipo: RawIpo): number | null {
  const t = st.subscriptionTable(ipo as any);
  return t ? t.total.times : null;
}

export function toCard(ipo: RawIpo, maxTimes: number): IpoCard {
  const stage = st.stageOf(ipo as any);
  const table = st.subscriptionTable(ipo as any);
  const t = table ? table.total.times : null;
  const cat = (k: string): number | null => {
    const r = table ? (table.rows as any[]).find((x) => x.key === k) : null;
    return r && Number.isFinite(r.times) ? r.times : null;
  };
  const name = st.shortName(ipo.name);
  const sizeN = st.issueSizeCrore(ipo as any);
  const minN = minInvestment(ipo);
  return {
    sym: ipo.symbol,
    id: ipo.id,
    name,
    legal: st.titleCase(ipo.name),
    board: ipo.type === 'sme' ? 'SME' : 'Mainboard',
    exchanges: (ipo.exchanges || []).join(', ') || (ipo.type === 'sme' ? 'SME platform' : 'NSE, BSE'),
    logo: ipo.logoUrl || null,
    ini: initials(name),
    stage,
    tone: OPEN_STAGES.includes(stage) ? 'open' : stage === 'upcoming' || stage === 'preapply' ? 'upcoming' : 'closed',
    status: statusText(ipo, stage),
    dates: dateRange(ipo.openDate, ipo.closeDate) || '—',
    band: priceBand(num(ipo.priceBandMin), num(ipo.priceBandMax)),
    min: rupees(minN),
    size: crore(sizeN),
    subs: t != null ? times(t) : null,
    subsN: t,
    bar: logWidth(t, maxTimes),
    qibN: cat('qib'),
    niiN: cat('nii'),
    retailN: cat('retail'),
    sizeN: Number.isFinite(sizeN as number) ? (sizeN as number) : null,
    minN,
    bandHi: num(ipo.priceBandMax) ?? num(ipo.priceBandMin),
    open: ipo.openDate || '',
    close: ipo.closeDate || '',
    listing: ipo.listingDate || '',
    allotment: ipo.allotmentDate || '',
    year: yearOf(ipo.openDate || ipo.listingDate),
    href: `/ipos/${encodeURIComponent(ipo.symbol)}/`,
    industry: (ipo.extra && typeof ipo.extra.industry === 'string' && ipo.extra.industry.trim()) || null,
    lot: num(ipo.lotSize) ? `${inr(num(ipo.lotSize)!)} shares` : '—',
    rhp: docUrl(ipo, (l) => /^rhp$/i.test(l) || (/prospectus/i.test(l) && !/draft/i.test(l))),
    drhp: docUrl(ipo, (l) => /drhp|draft/i.test(l)),
    registrar: ipo.registrar ? st.titleCase(ipo.registrar) : null,
    issueType: issueTypeOf(ipo.extra),
    blurb: blurbOf(ipo.extra && ipo.extra.companyDescription),
  };
}

function issueTypeOf(ex: any): string {
  const has = (leg: any) => !!(leg && Number(leg.value) > 0);
  const fresh = has(ex && ex.fresh);
  const ofs = has(ex && ex.ofs);
  return fresh && ofs ? 'Fresh + OFS' : fresh ? 'Fresh issue' : ofs ? 'Offer for sale' : '—';
}

/* Plain text, cut at a sentence end inside the first ~220 characters, else at a word. */
function blurbOf(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  if (t.length < 20) return null;
  if (t.length <= 220) return t;
  const cut = t.slice(0, 220);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.”'));
  return end > 80 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

function docUrl(ipo: RawIpo, match: (label: string) => boolean): string | null {
  const d = (ipo.documents || []).find((x) => x && x.url && st.isPublicDoc(x as any) && match(st.docLabel(x.type)));
  return d ? d.url : null;
}

/* ---------------------------------------------------------------- home --- */

export interface HomeModel {
  thisWeek: IpoCard[];
  actionable: IpoCard[];
  recent: IpoCard[];
  counts: { open: number; upcoming: number; recent: number };
  asOf: string;
  allotmentChoices: AllotmentChoiceFull[];
}

const daysBetween = (a: string, b: string): number => {
  const pa = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const pb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((pb - pa) / 86_400_000);
};

export function homeModel(raw: RawIpo[]): HomeModel {
  const today = st.istToday();
  const all = raw.map(normalise);
  /*
   * WHAT IS "ACTIONABLE": open, upcoming, and an issue between close and
   * listing — but only a recent one. The catalogue holds ~20 issues from
   * 2016 onwards with no listing date recorded, which the stage engine
   * correctly calls "awaiting allotment"; without the recency bound the home
   * page would lead with them.
   */
  const actionableRaw = all.filter((x) => {
    const s = st.stageOf(x as any);
    if (s === 'listed' || s === 'withdrawn') return false;
    if (s === 'awaiting' || s === 'allotmentout') return !!x.closeDate && daysBetween(x.closeDate, today) <= 21;
    return true;
  }).sort((a, b) => st.compareForList(a as any, b as any));
  const recentRaw = all
    .filter((x) => x.status === 'listed' && x.listingDate && daysBetween(x.listingDate, today) <= 45)
    .sort((a, b) => (a.listingDate! < b.listingDate! ? 1 : a.listingDate! > b.listingDate! ? -1 : a.symbol.localeCompare(b.symbol)));
  const maxT = Math.max(1, ...[...actionableRaw, ...recentRaw].map((x) => totalTimes(x) || 0));
  const actionable = actionableRaw.map((x) => toCard(x, maxT));
  const recent = recentRaw.map((x) => toCard(x, maxT));
  const thisWeek = actionable
    .filter((c) => c.tone === 'open' || (c.tone === 'upcoming' && c.open && daysBetween(today, c.open) <= 7))
    .slice(0, 4);
  return {
    thisWeek,
    actionable,
    recent,
    counts: {
      open: actionable.filter((c) => c.tone === 'open').length,
      upcoming: actionable.filter((c) => c.tone === 'upcoming').length,
      recent: recent.length,
    },
    asOf: today,
    allotmentChoices: allotmentChoices(all),
  };
}

export type AllotmentChoiceFull = {
  id: string; name: string; date: string; sym: string; board: string; logo: string | null; ini: string; registrar: string | null;
  /** The registrar's allotment-status page, when the operator entered one. */
  registrarUrl: string | null;
  /** Key dates as '18 Nov 2026', or '' when not entered. */
  closeD: string; allotD: string; refundD: string; dematD: string; listD: string;
};

export function allotmentChoices(all: RawIpo[]): AllotmentChoiceFull[] {
  const today = st.istToday();
  return all
    .filter((x) => x.closeDate && x.closeDate < today && daysBetween(x.closeDate, today) <= 90)
    .sort((a, b) => (a.closeDate! < b.closeDate! ? 1 : -1))
    .map((x) => ({
      id: x.id,
      name: st.shortName(x.name),
      date: x.allotmentDate ? wdDayMon(x.allotmentDate) : '',
      sym: x.symbol,
      board: x.type === 'sme' ? 'SME' : 'Mainboard',
      logo: x.logoUrl || null,
      ini: initials(st.shortName(x.name)),
      registrar: x.registrar ? st.titleCase(x.registrar) : null,
      registrarUrl: httpUrl((x.extra || {}).registrarUrl),
      closeD: dayMonYear(x.closeDate),
      allotD: dayMonYear(x.allotmentDate),
      refundD: dayMonYear(isoDay((x.extra || {}).refundDate)),
      dematD: dayMonYear(isoDay((x.extra || {}).dematDate)),
      listD: dayMonYear(x.listingDate),
    }));
}

/** A YYYY-MM-DD day from an operator-entered date, or ''. */
export const isoDay = (v: unknown): string => {
  const d = String(v || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
};
const httpUrl = (v: unknown): string | null => (typeof v === 'string' && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);

/* -------------------------------------------------------------- archive --- */

export interface ArchiveRow {
  sym: string; name: string; board: string; year: number | null; dates: string; band: string; size: string; subs: string | null; status: string; href: string;
  logo: string | null; ini: string; tone: Tone;
  /** For filters and sorting. */
  industry: string | null; sizeN: number | null; subsN: number | null; open: string;
  close: string; listing: string;
}

export function archiveModel(raw: RawIpo[]): ArchiveRow[] {
  const all = raw.map(normalise).sort((a, b) => ((a.openDate || '') < (b.openDate || '') ? 1 : -1));
  return all.map((x) => {
    const c = toCard(x, 1);
    return { sym: c.sym, name: c.name, board: c.board, year: c.year, dates: c.dates, band: c.band, size: c.size, subs: c.subs, status: c.status, href: c.href, logo: c.logo, ini: c.ini, tone: c.tone, industry: c.industry, sizeN: c.sizeN, subsN: c.subsN, open: c.open, close: c.close, listing: c.listing };
  });
}

/* --------------------------------------------------------------- detail --- */

const LABEL: Record<string, string> = {
  qib: 'QIB', nii: 'NII', hni: 'HNI (10L+)', hni2: 'HNI (2-10L)', retail: 'Retail',
  employee: 'Employee', shareholder: 'Shareholder', policyholder: 'Policyholder',
};

export interface SubRow { key: string; label: string; nested: boolean; book: string; bid: string; amount: string; times: string; width: number }

export interface DetailModel {
  card: IpoCard;
  industry: string | null;
  mechanism: string;
  face: string | null;
  lot: string;
  listedOn: string;
  timeline: { label: string; date: string; done: boolean }[];
  sub: null | {
    rows: SubRow[];
    total: { times: string; book: string; bid: string; amount: string; applications: string | null };
    asOf: string;
    final: boolean;
    anchorNote: string | null;
  };
  qibSplit: { label: string; pct: number; shares: string }[];
  reservation: { key: string; label: string; pct: number; shares: string; amount: string }[];
  lots: { cat: string; sub: string; lots: string; shares: string; amount: string }[];
  upperPrice: string;
  lowerPrice: string;
  /** Day-wise subscription, oldest first. Times as recorded each day (QIB on the gross offer). */
  days: { label: string; date: string; qib: number | null; nii: number | null; retail: number | null; employee: number | null; total: number | null }[];
  /** The financials table as numbers, when the operator's table is clean enough to read; the HTML stays the fallback. */
  financials: { cols: string[]; rows: { label: string; values: (number | null)[] }[] } | null;
  aboutHtml: string | null;
  strengthsHtml: string | null;
  financialsHtml: string | null;
  facts: { k: string; v: string }[];
  leads: string[];
  documents: { label: string; url: string }[];
  ctaNote: string;
  /** The registrar and the contact details the operator entered for it. */
  registrarInfo: { name: string; url: string | null; email: string | null; phone: string | null } | null;
  website: string | null;
  /** Objects of the issue, when the operator entered them as a list or as lines of text. */
  objects: string[];
  /** Other current issues, for a "more IPOs" strip. Filled by the route, empty otherwise. */
  others: IpoCard[];
}

const legSize = (leg: any): string | null => {
  if (!leg || !leg.value) return null;
  return leg.basis === 'shares' ? `${inr(Number(leg.value))} shares` : crore(Number(leg.value));
};

export function detailModel(rawIpo: RawIpo, others: IpoCard[] = []): DetailModel {
  const ipo = normalise(rawIpo);
  const ex = ipo.extra || {};
  const t = st.subscriptionTable(ipo as any);
  const card = toCard(ipo, t ? Math.max(1, ...t.rows.map((r: any) => r.times || 0)) : 1);
  const today = st.istToday();
  const stage = card.stage;

  let sub: DetailModel['sub'] = null;
  if (t && t.rows.length) {
    const rows = [...t.rows].sort((a: any, b: any) => ((st.SHARE_ORDER as any)[a.key] ?? 9) - ((st.SHARE_ORDER as any)[b.key] ?? 9));
    const maxR = Math.max(1, ...rows.map((r: any) => r.times || 0));
    const anchored = t.anchorDeducted > 0;
    sub = {
      rows: rows.map((r: any) => ({
        key: r.key,
        label: r.key === 'qib' && anchored ? 'QIB (Ex. Anchor)' : LABEL[r.key] || r.cat,
        nested: r.key === 'hni' || r.key === 'hni2',
        book: r.bookSize ? inr(r.bookSize) : '—',
        bid: r.subscribed ? inr(r.subscribed) : '—',
        amount: r.subAmount ? crore(r.subAmount / 1e7) : '—',
        times: times(r.times),
        width: logWidth(r.times, maxR),
      })),
      total: {
        times: times(t.total.times),
        book: t.total.bookSize ? inr(t.total.bookSize) : '—',
        bid: t.total.subscribed ? inr(t.total.subscribed) : '—',
        amount: t.total.subAmount ? crore(t.total.subAmount / 1e7) : '—',
        applications: (t.total as any).bidCount ? inr((t.total as any).bidCount) : null,
      },
      asOf: ipo.subscriptionAsOf ? st.fmtDateTime(ipo.subscriptionAsOf) : '',
      final: !OPEN_STAGES.includes(stage),
      anchorNote: anchored
        ? t.anchorBasis === 'actual'
          ? `QIB excludes the anchor allotment of ${inr(t.anchorDeducted)} shares.`
          : `QIB excludes the anchor portion of ${inr(t.anchorDeducted)} shares, estimated from the reserved percentage.`
        : null,
    };
  }

  const split = ex.qibSplit ? (st.qibSubRows(ex.qibSplit) as [string, number][]) : [];
  const splitTotal = split.reduce((s, q) => s + q[1], 0);
  const qibSplit = splitTotal > 0
    ? split.map((q) => ({ label: q[0], pct: Math.round((q[1] / splitTotal) * 1000) / 10, shares: inr(q[1]) }))
    : [];

  const reservation = (st.reservation(ipo as any) as any[])
    .filter((r) => r.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .map((r) => ({ key: r.key, label: r.cat, pct: Math.round(r.pct * 100) / 100, shares: r.shares ? inr(r.shares) : '—', amount: r.amount ? crore(r.amount / 1e7) : '—' }));

  const groups: Record<string, any[]> = {};
  for (const l of st.lotLadder(ipo as any) as any[]) (groups[l.cat] = groups[l.cat] || []).push(l);
  const lots = Object.entries(groups).map(([cat, ls]) => {
    const a = ls[0];
    const b = ls[ls.length - 1];
    const range = ls.length > 1;
    return {
      cat,
      sub: a.sub || '',
      lots: range ? `${a.lots}–${b.lots}` : `${a.lots}`,
      shares: range ? `${inr(a.shares)}–${inr(b.shares)}` : inr(a.shares),
      amount: range ? `${rupees(a.amount)}–${rupees(b.amount)}` : rupees(a.amount),
    };
  });

  const tl = (st.timeline(ipo as any) as any[]).filter((x) => x.date).map((x) => ({
    label: String(x.label)
      .replace('Open date', 'Bidding opens').replace('Close date', 'Bidding closes')
      .replace('Basis of allotment', 'Allotment').replace('Initiation of refunds', 'Refunds')
      .replace('Credit to demat', 'Demat credit').replace('Listing date', 'Listing'),
    date: wdDayMon(String(x.date).slice(0, 10)),
    done: String(x.date).slice(0, 10) <= today,
  }));

  const html = (v: unknown) => {
    if (typeof v !== 'string' || v.replace(/<[^>]*>/g, '').trim().length < 3) return null;
    return st.cleanRich(v);
  };

  const facts: { k: string; v: string }[] = [];
  const push = (k: string, v: string | null | undefined) => { if (v) facts.push({ k, v }); };
  push('Issue type', ex.mechanism === 'fixed_price' ? 'Fixed price' : 'Book built');
  push('Fresh issue', legSize(ex.fresh));
  push('Offer for sale', ex.ofs ? (ex.ofs.value ? legSize(ex.ofs) : 'None') : null);
  push('Face value', ex.faceValue ? `₹${ex.faceValue} per share` : null);
  push('Lot size', num(ipo.lotSize) ? `${num(ipo.lotSize)} shares` : null);
  push('ISIN', ipo.isin || null);
  push('Registrar', ipo.registrar ? st.titleCase(ipo.registrar) : null);
  push('Listing on', card.exchanges);

  /* The final offer document first: an investor reading a live or closed issue wants the RHP, not the draft. */
  const docRank = (label: string) => (/^rhp$/i.test(label) ? 0 : /prospectus/i.test(label) && !/draft/i.test(label) ? 1 : /drhp/i.test(label) ? 3 : 2);
  const documents = (ipo.documents || [])
    .filter((d) => d && d.url && st.isPublicDoc(d as any))
    .map((d) => ({ label: st.docLabel(d.type), url: d.url }))
    .sort((a, b) => docRank(a.label) - docRank(b.label));

  const ctaNote = OPEN_STAGES.includes(stage)
    ? `Bidding is open until ${wdDayMon(ipo.closeDate)}, 5:00 PM.`
    : stage === 'upcoming' || stage === 'preapply'
      ? `Bidding opens ${wdDayMon(ipo.openDate)} at 10:00 AM.`
      : stage === 'listed'
        ? `Shares listed on ${wdDayMon(ipo.listingDate)}.`
        : ipo.allotmentDate ? `Allotment is due ${wdDayMon(ipo.allotmentDate)}.` : 'Bidding has closed.';

  return {
    card,
    industry: ex.industry || null,
    mechanism: ex.mechanism === 'fixed_price' ? 'Fixed price' : 'Book built',
    face: ex.faceValue ? `₹${ex.faceValue}` : null,
    lot: num(ipo.lotSize) ? `${num(ipo.lotSize)} shares` : '—',
    listedOn: ipo.listingDate ? dayMonYear(ipo.listingDate) : '',
    timeline: tl,
    sub,
    qibSplit,
    reservation,
    lots,
    upperPrice: rupees(num(ipo.priceBandMax) ?? num(ipo.priceBandMin)),
    lowerPrice: rupees(num(ipo.priceBandMin) ?? num(ipo.priceBandMax)),
    days: st.dayWiseRows(ex.subLog, null, ipo.closeDate).slice().reverse().map((d: any) => ({ label: `Day ${d.dayNo}`, date: dayMon(d.d), qib: d.entry.qib ?? null, nii: d.entry.nii ?? null, retail: d.entry.retail ?? null, employee: d.entry.employee ?? null, total: d.entry.total ?? null })),
    financials: financialTable(ex.companyFinancials),
    aboutHtml: html(ex.companyDescription),
    strengthsHtml: html(ex.companyStrength),
    financialsHtml: html(ex.companyFinancials),
    facts,
    leads: Array.isArray(ex.leads) ? ex.leads.filter(Boolean) : [],
    documents,
    ctaNote,
    registrarInfo: ipo.registrar
      ? {
        name: st.titleCase(ipo.registrar),
        url: typeof ex.registrarUrl === 'string' && /^https?:\/\//i.test(ex.registrarUrl.trim()) ? ex.registrarUrl.trim() : null,
        email: typeof ex.registrarEmail === 'string' && ex.registrarEmail.includes('@') ? ex.registrarEmail.trim() : null,
        phone: typeof ex.registrarPhone === 'string' && ex.registrarPhone.trim() ? ex.registrarPhone.trim() : null,
      }
      : null,
    website: typeof ex.companyWebsite === 'string' && /^https?:\/\//i.test(ex.companyWebsite.trim()) ? ex.companyWebsite.trim() : null,
    objects: objectsOf(ex.objects),
    others: others.filter((o) => o.sym !== ipo.symbol).slice(0, 4),
  };
}

/*
 * The operator's financials are free HTML. When they are a plain table — a
 * header row of periods, then rows of a label and figures — read them as
 * numbers so a design can chart them. Anything less regular returns null and
 * the design shows the HTML as written: a chart must never be a guess.
 */
export function financialTable(v: unknown): DetailModel['financials'] {
  if (typeof v !== 'string' || !/<tr/i.test(v)) return null;
  const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const rows = [...v.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => text(c[1])));
  if (rows.length < 3) return null;
  const toNum = (t: string): number | null => { const c = t.replace(/[,₹\s]/g, ''); return /^-?\d+(\.\d+)?$/.test(c) ? Number(c) : null; };
  const [head, ...body] = rows;
  if (head.length < 3) return null;
  const cols = head.slice(1);
  const parsed = body
    .filter((r) => r.length === head.length && r[0])
    .map((r) => ({ label: r[0], values: r.slice(1).map(toNum) }))
    .filter((r) => r.values.filter((x) => x != null).length >= Math.max(2, cols.length - 1));
  return parsed.length >= 2 && cols.every((c) => c && toNum(c) == null) ? { cols, rows: parsed } : null;
}

function objectsOf(v: unknown): string[] {
  const clean = (t: string) => t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (Array.isArray(v)) return v.map((x) => clean(String(typeof x === 'object' && x ? (x as any).text ?? (x as any).title ?? '' : x))).filter((t) => t.length > 2);
  if (typeof v === 'string') return v.split(/\n|<\/p>|<\/li>/i).map(clean).filter((t) => t.length > 2);
  return [];
}

/** The pool a detail page's "other IPOs" strip draws from: the home page's actionable list. */
export function otherIposPool(raw: RawIpo[]): IpoCard[] {
  return homeModel(raw).actionable;
}

export function detailSymbols(raw: RawIpo[]): string[] {
  return raw.map((x) => x.symbol).filter((s) => /^[A-Za-z0-9._-]+$/.test(s));
}

/* --------------------------------------------------------- subscription --- */

type SubCells = { qib: string; nii: string; retail: string; hni: string; hni2: string; employee: string };

export interface SubFocus {
  rows: { key: string; label: string; times: number | null; timesText: string; width: number; nested: boolean }[];
  total: { times: number | null; timesText: string; applications: string | null; bid: string; book: string };
  /** Who applied: share of applications by category, from the exchange's bid counts. */
  share: { label: string; n: number; pct: number }[];
  /** Day-wise log, oldest first. Times as recorded each day (QIB on the gross offer). */
  days: { label: string; date: string; qib: number | null; nii: number | null; retail: number | null; employee: number | null; total: number | null }[];
  catRows: { key: string; label: string; nested: boolean; book: string; bid: string; timesText: string; bidN: number | null }[];
}

export interface SubscriptionModel {
  live: (IpoCard & SubCells & { asOf: string })[];
  closed: (IpoCard & SubCells)[];
  next: IpoCard | null;
  /** Per-issue detail for every live and closed row, keyed by symbol. */
  focus: Record<string, SubFocus>;
}

function subFocus(x: RawIpo, t: any): SubFocus {
  const rows = [...t.rows].sort((a: any, b: any) => ((st.SHARE_ORDER as any)[a.key] ?? 9) - ((st.SHARE_ORDER as any)[b.key] ?? 9));
  const maxR = Math.max(1, ...rows.map((r: any) => r.times || 0));
  const anchored = t.anchorDeducted > 0;
  const label = (r: any) => (r.key === 'qib' && anchored ? 'QIB (Ex. Anchor)' : LABEL[r.key] || r.cat);
  const by = (k: string) => rows.find((r: any) => r.key === k);
  const bids = (k: string) => { const r: any = by(k); return r && Number(r.bidCount) > 0 ? Number(r.bidCount) : 0; };
  const niiBids = bids('nii') || bids('hni') + bids('hni2');
  const parts: [string, number][] = [['Retail', bids('retail')], ['NII', niiBids], ['QIB', bids('qib')], ['Employee', bids('employee')], ['Shareholder', bids('shareholder')]];
  const sum = parts.reduce((a, p) => a + p[1], 0);
  const share = sum > 0 ? parts.filter((p) => p[1] > 0).map(([l, n]) => ({ label: l, n, pct: Math.round((n / sum) * 1000) / 10 })) : [];
  const log = st.dayWiseRows((x.extra || {}).subLog, null, x.closeDate).slice().reverse();
  return {
    rows: rows.filter((r: any) => r.key !== 'shareholder' || r.times).map((r: any) => ({ key: r.key, label: label(r), times: Number.isFinite(r.times) ? r.times : null, timesText: times(r.times), width: logWidth(r.times, maxR), nested: r.key === 'hni' || r.key === 'hni2' })),
    total: {
      times: Number.isFinite(t.total.times) ? t.total.times : null,
      timesText: times(t.total.times),
      applications: (t.total as any).bidCount ? inr((t.total as any).bidCount) : null,
      bid: t.total.subscribed ? inr(t.total.subscribed) : '—',
      book: t.total.bookSize ? inr(t.total.bookSize) : '—',
    },
    share,
    days: log.map((d: any) => ({ label: `Day ${d.dayNo}`, date: dayMon(d.d), qib: d.entry.qib ?? null, nii: d.entry.nii ?? null, retail: d.entry.retail ?? null, employee: d.entry.employee ?? null, total: d.entry.total ?? null })),
    catRows: rows.map((r: any) => ({ key: r.key, label: label(r), nested: r.key === 'hni' || r.key === 'hni2', book: r.bookSize ? inr(r.bookSize) : '—', bid: r.subscribed ? inr(r.subscribed) : '—', timesText: times(r.times), bidN: Number(r.subscribed) > 0 ? Number(r.subscribed) : null })),
  };
}

export function subscriptionModel(raw: RawIpo[]): SubscriptionModel {
  const today = st.istToday();
  const all = raw.map(normalise);
  const withT = all.map((x) => ({ x, t: st.subscriptionTable(x as any) })).filter((r) => r.t && r.t.rows.length);
  const maxT = Math.max(1, ...withT.map((r) => r.t!.total.times || 0));
  const by = (t: any, k: string) => times((t.rows.find((r: any) => r.key === k) || {}).times ?? null);
  const cells = (t: any): SubCells => ({
    qib: by(t, 'qib'), nii: by(t, 'nii'), retail: by(t, 'retail'), hni: by(t, 'hni'), hni2: by(t, 'hni2'), employee: by(t, 'employee'),
  });
  const live = withT
    .filter((r) => OPEN_STAGES.includes(st.stageOf(r.x as any)))
    .sort((a, b) => st.compareForList(a.x as any, b.x as any))
    .map((r) => ({ ...toCard(r.x, maxT), ...cells(r.t), asOf: r.x.subscriptionAsOf ? st.fmtDateTime(r.x.subscriptionAsOf) : '' }));
  const closed = withT
    .filter((r) => !OPEN_STAGES.includes(st.stageOf(r.x as any)) && r.x.closeDate && r.x.closeDate < today && daysBetween(r.x.closeDate, today) <= 35)
    .sort((a, b) => (a.x.closeDate! < b.x.closeDate! ? 1 : a.x.closeDate! > b.x.closeDate! ? -1 : a.x.symbol.localeCompare(b.x.symbol)))
    .map((r) => ({ ...toCard(r.x, maxT), ...cells(r.t) }));
  const upcoming = all
    .filter((x) => ['upcoming', 'preapply'].includes(st.stageOf(x as any)) && x.openDate)
    .sort((a, b) => (a.openDate! < b.openDate! ? -1 : 1));
  const focus: Record<string, SubFocus> = {};
  for (const r of withT) {
    const s = st.stageOf(r.x as any);
    const inLive = OPEN_STAGES.includes(s);
    const inClosed = !inLive && r.x.closeDate && r.x.closeDate < today && daysBetween(r.x.closeDate, today) <= 35;
    if (inLive || inClosed) focus[r.x.symbol] = subFocus(r.x, r.t);
  }
  return { live, closed, next: upcoming[0] ? toCard(upcoming[0], maxT) : null, focus };
}
