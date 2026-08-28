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
 * upcoming, most recent first for anything already finished).
 */
export function compareForList(a: StageInput & { closeDate?: string; openDate?: string; listingDate?: string },
                               b: typeof a): number {
  const ra = stageRank(a);
  const rb = stageRank(b);
  if (ra !== rb) return ra - rb;
  const finished = ra >= STAGE_RANK.allotmentout;
  const key = (x: typeof a) => (finished ? (x.listingDate ?? x.closeDate ?? '') : (x.closeDate ?? x.openDate ?? ''));
  const ka = key(a);
  const kb = key(b);
  if (!ka && !kb) return 0;
  if (!ka) return 1;
  if (!kb) return -1;
  return finished ? kb.localeCompare(ka) : ka.localeCompare(kb);
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
 * Stage → colour tone. The ONE status colour contract, shared by web and mobile.
 *
 * It lives here rather than in each surface's stylesheet because it had already
 * drifted six ways: gold meant Closing Today on a card, Upcoming in the filter
 * bar and Allotment Out on mobile; grey meant Upcoming on a card but Listing in
 * the market board; and mobile painted Closing Today RED where web painted it
 * gold. Web alone held four independent copies of the same four-colour dot
 * palette.
 *
 * Five tones, each with one meaning:
 *
 *   live    green   — you can apply right now
 *   urgent  gold    — act TODAY: the last day to apply, or an allotment to check
 *   soon    indigo  — coming, nothing to do yet
 *   listed  purple  — trading; the issue is history
 *   ended   clay    — finished and gone (withdrawn, and anything labelled Closed)
 *   quiet   grey    — waiting, with nothing for the investor to do
 *
 * Gold covering both Closing Today and Allotment Out is deliberate: they are
 * the two states that need the investor TODAY, which is one meaning, not two.
 */
export type StageTone = 'live' | 'urgent' | 'soon' | 'listed' | 'ended' | 'quiet';

export const STAGE_TONE: Record<Stage, StageTone> = {
  opentoday: 'live',
  live: 'live',
  closingtoday: 'urgent',
  allotmentout: 'urgent',
  preapply: 'soon',
  upcoming: 'soon',
  listed: 'listed',
  awaiting: 'quiet',
  withdrawn: 'ended',
};

export const toneOf = (ipo: StageInput): StageTone => STAGE_TONE[stageOf(ipo)];
