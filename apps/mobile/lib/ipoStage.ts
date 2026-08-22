/**
 * IPO lifecycle engine — ONE source of truth for what the app says and shows
 * at each stage. Cards, the detail screen and the hubs all read from here, so
 * a wording or ordering decision is made once and applied everywhere.
 *
 * Stages (investor's mental model, not the DB enum):
 *   upcoming → preapply → opentoday → live → closingtoday → awaiting
 *   → allotmentout → listed
 */
import type { ChipTone } from '../components/ui/Chip';
import type { IpoFull } from './ipoCalc';

export type Stage =
  | 'upcoming' | 'preapply' | 'opentoday' | 'live' | 'closingtoday'
  | 'awaiting' | 'allotmentout' | 'listed' | 'withdrawn';

/** Detail panels a card/detail screen offers, in the order this stage needs them. */
export type PanelKey = 'sub' | 'reservation' | 'lot' | 'timeline';

/** What the primary button does at this stage. */
export type CtaKind = 'apply' | 'preapply' | 'remind' | 'allotment' | 'performance' | 'details';

export interface StageInfo {
  stage: Stage;
  /** short status chip text, e.g. "Closing Today" */
  label: string;
  tone: ChipTone;
  /** live states carry a pulse dot */
  pulse: boolean;
  /** one-line context under the stat grid, e.g. "Closes tomorrow · 2 days left" */
  note: string | null;
  /** panels this stage makes available, most relevant first */
  panels: PanelKey[];
  cta: { kind: CtaKind; label: string };
}

const localDay = (): string => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const daysFrom = (date?: string): number | null => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return Math.round(
    (new Date(`${date}T00:00:00`).getTime() - new Date(`${localDay()}T00:00:00`).getTime()) / 86_400_000,
  );
};
const inDays = (n: number): string => (n === 1 ? 'tomorrow' : `in ${n} days`);

/** Human label for the panel chips — industry wording, not internal keys. */
export const PANEL_LABEL: Record<PanelKey, string> = {
  sub: 'Subscription',
  reservation: 'Reservation',
  lot: 'Lot Details',
  timeline: 'Key Dates',
};

export function stageOf(ipo: IpoFull): StageInfo {
  const today = localDay();
  const startBid = (ipo.extra as any)?.startBid === true;

  if (ipo.status === 'withdrawn') {
    return {
      stage: 'withdrawn', label: 'Withdrawn', tone: 'danger', pulse: false,
      note: 'This issue was withdrawn by the company.',
      panels: ['timeline'], cta: { kind: 'details', label: 'View Details' },
    };
  }

  // ── listed: performance is the whole story ──
  if (ipo.status === 'listed') {
    const d = daysFrom(ipo.listingDate);
    return {
      stage: 'listed', label: 'Listed', tone: 'listed', pulse: false,
      note: d != null && d === 0 ? 'Listed today' : d != null && d > -7 ? `Listed ${d === -1 ? 'yesterday' : `${-d} days ago`}` : null,
      panels: ['sub', 'timeline'],
      cta: { kind: 'performance', label: 'IPO Performance' },
    };
  }

  // ── closed: awaiting basis of allotment, then allotment out ──
  if (ipo.status === 'closed') {
    const a = daysFrom(ipo.allotmentDate);
    if (a != null && a <= 0) {
      const l = daysFrom(ipo.listingDate);
      return {
        stage: 'allotmentout', label: 'Allotment Out', tone: 'gold', pulse: true,
        note: l != null && l >= 0 ? `Lists ${l === 0 ? 'today' : inDays(l)}` : 'Allotment status is available',
        panels: ['sub', 'timeline'],
        cta: { kind: 'allotment', label: 'Check Allotment' },
      };
    }
    return {
      stage: 'awaiting', label: 'Awaiting Allotment', tone: 'info', pulse: false,
      note: a != null ? `Allotment ${a === 0 ? 'today' : inDays(a)}` : 'Basis of allotment awaited',
      panels: ['sub', 'timeline'],
      cta: { kind: 'allotment', label: 'Check Allotment' },
    };
  }

  // ── open: bidding window ──
  if (ipo.status === 'open') {
    const c = daysFrom(ipo.closeDate);
    const base = { panels: ['sub', 'lot', 'reservation'] as PanelKey[], pulse: true };
    const cta = startBid
      ? { kind: 'apply' as CtaKind, label: 'Apply Now' }
      : { kind: 'remind' as CtaKind, label: 'Remind Me' };
    if (ipo.closeDate === today) {
      return { stage: 'closingtoday', label: 'Closing Today', tone: 'danger', note: 'Last day to apply', ...base, cta };
    }
    if (ipo.openDate === today) {
      return {
        stage: 'opentoday', label: 'Open Today', tone: 'success',
        note: c != null ? `Closes ${c === 0 ? 'today' : inDays(c)}` : null, ...base, cta,
      };
    }
    return {
      stage: 'live', label: 'Live', tone: 'success',
      note: c != null ? `Closes ${c === 0 ? 'today' : inDays(c)}` : null, ...base, cta,
    };
  }

  // ── upcoming: pre-apply when the operator has opened bidding early ──
  const o = daysFrom(ipo.openDate);
  const openNote = o == null ? 'Dates to be announced' : o === 0 ? 'Opens today' : `Opens ${inDays(o)}`;
  const panels: PanelKey[] = ['lot', 'reservation', 'timeline'];
  if (startBid) {
    return {
      stage: 'preapply', label: 'Pre Apply', tone: 'brand', pulse: false,
      note: `${openNote} · apply before the rush`, panels,
      cta: { kind: 'preapply', label: 'Pre Apply' },
    };
  }
  return {
    stage: 'upcoming',
    label: o != null && o >= 0 && o <= 4 ? (o === 0 ? 'Opens Today' : o === 1 ? 'Opens Tomorrow' : `Opens in ${o}d`) : 'Upcoming',
    tone: 'warn', pulse: false, note: openNote, panels,
    cta: { kind: 'remind', label: 'Remind Me' },
  };
}

/** Demand in plain words, calibrated per board (SME runs an order hotter). */
export function demandWord(subX: number, sme: boolean): string {
  const th = sme ? [1, 10, 50] : [1, 3, 10];
  if (subX < th[0]) return 'Building up';
  if (subX < th[1]) return 'Steady demand';
  if (subX < th[2]) return 'Strong demand';
  return 'Exceptional demand';
}

/** Expected listing gain implied by the grey-market premium (arithmetic, not a forecast). */
export function gmpGainPct(ipo: IpoFull): number | null {
  const price = ipo.priceBandMax ?? ipo.priceBandMin;
  if (ipo.gmp == null || !price) return null;
  if (ipo.gmpPct != null) return ipo.gmpPct;
  return Math.round((ipo.gmp / price) * 1000) / 10;
}
