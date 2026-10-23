/**
 * Day-wise subscription — the derivation behind the table, for both surfaces.
 *
 * Web has rendered this as a six-column table with an hourly drill-down since
 * 2026-09-23. Mobile has had a TOTAL-ONLY SPARKLINE: one line for the whole
 * issue, no categories, no hours. The table shape cannot survive a phone, but
 * the arithmetic under it is the same arithmetic, and it is the part with the
 * rules worth getting right — so it lives here and each surface draws it in the
 * shape it has room for.
 *
 * WHAT THE POLLER WRITES (`Ipo.extra`, both poller-owned and in
 * `SERVER_OWNED_EXTRA`, so an operator save cannot delete them):
 *   `subLog`      — one entry per bidding day, EOD, 14-day cap.
 *   `subLogHour`  — a rolling 72-entry window (3 days x 24h), deduped by the
 *                   hour bucket, so the latest snapshot in each hour wins.
 *
 * NEITHER CAN BE BACKFILLED. Application figures reach the log only from
 * 2026-10-01 and hourly entries only from 2026-09-18, so every issue that
 * closed earlier has none and never will — which is why `hasAppFigures` exists
 * rather than a surface assuming the key is there.
 */

export interface DayAppCell {
  /** Applications RECEIVED in this category. */
  n?: number | null;
  /** The by-applications multiple. Absent for QIB, which has no minimum bid. */
  x?: number | null;
}

export interface DayEntry {
  d?: string;
  qib?: number | null;
  nii?: number | null;
  retail?: number | null;
  hni?: number | null;
  hni2?: number | null;
  employee?: number | null;
  shareholder?: number | null;
  total?: number | null;
  apps?: Record<string, DayAppCell> | null;
}

/** A within-day snapshot. `t` is the hour bucket, "15:00". */
export interface HourEntry extends DayEntry {
  t?: string;
}

/** One bidding day, with its hourly snapshots and what to call it. */
export interface DayWiseRow {
  /** ISO date, as logged. */
  d: string;
  /**
   * The BIDDING day number — the row's POSITION in the ascending log, never a
   * date subtraction. A window straddling a weekend (Friday close, Tuesday
   * open) would otherwise number its three bidding days 1, 4 and 5. The poller
   * writes one entry per open day, so position is the bidding day.
   */
  dayNo: number;
  /** True on the issue's close date — rendered as "(Last)". */
  isLast: boolean;
  entry: DayEntry;
  /** Hourly snapshots for this day, earliest first. Empty for older records. */
  hours: HourEntry[];
}

/**
 * Days NEWEST FIRST, each carrying its bidding-day number and its hours.
 *
 * Newest first because the question a reader has on an open issue is what it is
 * doing now; the numbering still counts from the first day, so "Day 3 (Last)"
 * sits at the top rather than the bottom.
 */
export function dayWiseRows(
  subLog: readonly DayEntry[] | null | undefined,
  subLogHour: readonly HourEntry[] | null | undefined,
  closeDate?: string | null,
): DayWiseRow[] {
  const days = (subLog ?? []).filter((e): e is DayEntry & { d: string } => Boolean(e?.d));

  /* Numbered from the ASCENDING log before anything is reversed. */
  const dayNo = new Map<string, number>();
  days.forEach((e, i) => dayNo.set(e.d, i + 1));

  /* Hours grouped once, for an O(1) lookup per day rather than a scan each. */
  const byDay = new Map<string, HourEntry[]>();
  for (const h of subLogHour ?? []) {
    if (!h?.d) continue;
    const arr = byDay.get(h.d) ?? [];
    arr.push(h);
    byDay.set(h.d, arr);
  }
  for (const arr of byDay.values()) arr.sort((a, b) => String(a.t ?? '').localeCompare(String(b.t ?? '')));

  return days
    .slice()
    .reverse()
    .map((entry) => ({
      d: entry.d,
      dayNo: dayNo.get(entry.d) ?? 0,
      isLast: Boolean(closeDate && entry.d === closeDate),
      entry,
      hours: byDay.get(entry.d) ?? [],
    }));
}

/**
 * Whether ANY entry carries application figures.
 *
 * The Application-wise view is offered only when there is something behind it.
 * The figures cannot be backfilled, so most of the catalogue has none — and an
 * empty view is worse than no view, which is the same call `AppWisePanel`
 * makes about its own toggle.
 */
export function hasAppFigures(
  subLog: readonly DayEntry[] | null | undefined,
  subLogHour: readonly HourEntry[] | null | undefined,
): boolean {
  return [...(subLog ?? []), ...(subLogHour ?? [])].some(
    (e) => e?.apps && Object.values(e.apps).some((c) => c && (c.x != null || c.n != null)),
  );
}

/**
 * The columns a day-wise table shows, in order.
 *
 * bHNI reads `hni ?? nii` — a legacy row logged before the split carries only
 * the combined NII figure, and showing nothing there would lose the only NII
 * information such a row has.
 */
export const DAY_WISE_COLUMNS: { key: string; label: string; sub?: boolean }[] = [
  { key: 'qib', label: 'QIB' },
  { key: 'hni', label: 'bHNI', sub: true },
  { key: 'hni2', label: 'sHNI', sub: true },
  { key: 'retail', label: 'Retail' },
  { key: 'total', label: 'Total' },
];

/** The share-wise multiple for a column, with the legacy bHNI fallback. */
export function dayValue(e: DayEntry, key: string): number | null | undefined {
  if (key === 'hni') return e.hni ?? e.nii;
  return (e as Record<string, unknown>)[key] as number | null | undefined;
}
