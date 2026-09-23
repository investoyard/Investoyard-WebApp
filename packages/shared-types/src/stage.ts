/**
 * IPO lifecycle stage — the ONE derivation shared by web and mobile.
 *
 * The operator sets `status` by hand and often forgets to advance it, so the
 * stage is derived from the dates and never shows an earlier phase than the
 * dates prove. Mobile maps the stage onto tone/panels/CTA in lib/ipoStage.ts;
 * web uses it for the list ordering and status chips.
 */

export type Stage =
  | 'closingtoday' | 'opentoday' | 'live' | 'preapply' | 'upcoming'
  | 'awaiting' | 'allotmentout' | 'listed' | 'withdrawn';

export interface StageInput {
  status?: string;
  openDate?: string;
  closeDate?: string;
  allotmentDate?: string;
  listingDate?: string;
  extra?: { startBid?: boolean } | Record<string, any> | null;
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

/**
 * Display order for lists: what needs the investor's attention TODAY comes
 * first. Closing today outranks everything — it's the last chance to apply.
 */
export const STAGE_RANK: Record<Stage, number> = {
  closingtoday: 0,
  opentoday: 1,
  live: 2,
  preapply: 3,
  upcoming: 4,
  allotmentout: 5,
  awaiting: 6,
  listed: 7,
  withdrawn: 8,
};

export function stageOf(ipo: StageInput): Stage {
  if (ipo.status === 'withdrawn') return 'withdrawn';
  const today = localDay();
  const startBid = (ipo.extra as any)?.startBid === true;

  if (ipo.status === 'listed') return 'listed';

  if (ipo.status === 'closed') {
    const a = daysFrom(ipo.allotmentDate);
    return a != null && a <= 0 ? 'allotmentout' : 'awaiting';
  }

  if (ipo.status === 'open') {
    if (ipo.closeDate === today) return 'closingtoday';
    if (ipo.openDate === today) return 'opentoday';
    return 'live';
  }

  return startBid ? 'preapply' : 'upcoming';
}

export const stageRank = (ipo: StageInput): number => STAGE_RANK[stageOf(ipo)];

/** Customer-facing status label — identical wording on both surfaces. */
export function stageLabel(ipo: StageInput): string {
  const s = stageOf(ipo);
  switch (s) {
    case 'closingtoday': return 'Closing Today';
    case 'opentoday': return 'Open Today';
    case 'live': return 'Live';
    case 'preapply': return 'Pre Apply';
    case 'allotmentout': return 'Allotment Out';
    case 'awaiting': return 'Awaiting Allotment';
    case 'listed': return 'Listed';
    case 'withdrawn': return 'Withdrawn';
    default: {
      const d = daysFrom(ipo.openDate);
      if (d === 0) return 'Opens Today';
      if (d === 1) return 'Opens Tomorrow';
      if (d != null && d > 1 && d <= 4) return `Opens in ${d}d`;
      return 'Opening Soon';
    }
  }
}

/**
 * Sort comparator for catalog lists: stage order first, then the date that
 * matters within that stage (soonest close for live issues, soonest open for
 * upcoming, most recent first for anything already finished), and finally the
 * symbol so the answer is never "these two are equal".
 *
 * That last step is not decoration. Four issues sharing a stage AND a close
 * date is ordinary — 23 Sep 2026 had exactly that — and returning 0 for them
 * leaves their order to whatever the API happened to send, which is not
 * guaranteed. The same four then rendered Elevate-first in one build and
 * Swastika-first in the next, and /subscription could disagree with the home
 * cards. Symbol is stable, unique and present on every record.
 *
 * Deliberately NOT subscription: those numbers change on every poll, so a card
 * would move under the reader's cursor while they were looking at it.
 */
export function compareForList(a: StageInput & { closeDate?: string; openDate?: string; listingDate?: string; symbol?: string },
                               b: typeof a): number {
  const ra = stageRank(a);
  const rb = stageRank(b);
  if (ra !== rb) return ra - rb;
  const finished = ra >= STAGE_RANK.allotmentout;
  const key = (x: typeof a) => (finished ? (x.listingDate ?? x.closeDate ?? '') : (x.closeDate ?? x.openDate ?? ''));
  const ka = key(a);
  const kb = key(b);
  const bySymbol = () => (a.symbol ?? '').localeCompare(b.symbol ?? '');
  if (!ka && !kb) return bySymbol();
  if (!ka) return 1;
  if (!kb) return -1;
  const byDate = finished ? kb.localeCompare(ka) : ka.localeCompare(kb);
  return byDate !== 0 ? byDate : bySymbol();
}

/** True when the issue is still current — open, upcoming, or recently finished. */
export function isRecent(ipo: StageInput & { listingDate?: string; closeDate?: string }, months = 6): boolean {
  if (stageRank(ipo) < STAGE_RANK.allotmentout) return true; // anything not finished is current
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const iso = cutoff.toISOString().slice(0, 10);
  const marker = ipo.listingDate ?? ipo.closeDate ?? '';
  return marker >= iso;
}

/**
 * Stage → colour. ONE colour per status, shared by web and mobile.
 *
 * A colour code, not a mood: each status owns a colour and no two statuses
 * share one, so the same status is the same swatch on every screen. An earlier
 * version grouped statuses by what they MEANT — Closing Today and Allotment
 * Out were both "act today", so both gold — which left two different statuses
 * indistinguishable side by side in the Today row.
 *
 *   live       green   #12925a   Live / Open Today
 *   closing    red     #d8412a   Closing Today, Closed, Withdrawn — the close family
 *   preapply   indigo  #7565bd   Pre Apply
 *   upcoming   indigo  #3c2e7e   Upcoming / Opens in Nd
 *   awaiting   grey    #908d9e   Awaiting Allotment
 *   allotment  gold    #e6ad12   Allotment Out
 *   listed     purple  #9b7fd4   Listed
 *
 * Two FAMILIES share a colour, and only these two. Open Today is Live on its
 * first day; Closing Today, Closed and Withdrawn are one event caught at
 * different moments. Within a family the card separates states with a solid
 * fill, never a second colour. Everything else owns its colour outright.
 */
export type StageTone =
  | 'live' | 'closing' | 'preapply' | 'upcoming'
  | 'awaiting' | 'allotment' | 'listed';

export const STAGE_TONE: Record<Stage, StageTone> = {
  opentoday: 'live',
  live: 'live',
  closingtoday: 'closing',
  preapply: 'preapply',
  upcoming: 'upcoming',
  awaiting: 'awaiting',
  allotmentout: 'allotment',
  listed: 'listed',
  withdrawn: 'closing',
};

export const toneOf = (ipo: StageInput): StageTone => STAGE_TONE[stageOf(ipo)];
