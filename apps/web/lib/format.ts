export function inr(n?: number): string {
  return n == null ? '—' : '₹' + n.toLocaleString('en-IN');
}

export function priceBand(min?: number, max?: number): string {
  if (min == null) return '—';
  return max != null && max !== min ? `₹${min}–${max}` : `₹${min}`;
}

/** Whole days until end of the given date (negative if past). */
export function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const end = new Date(dateStr);
  end.setHours(23, 59, 59, 999);
  return Math.ceil((end.getTime() - Date.now()) / 86_400_000);
}

export function closesInLabel(closeDate?: string): string | null {
  const d = daysUntil(closeDate);
  if (d == null || d < 0) return null;
  if (d === 0) return 'Closes today';
  if (d === 1) return 'Closes tomorrow';
  return `Closes in ${d} days`;
}

export type IpoPhase = 'upcoming' | 'live' | 'closed' | 'allotment' | 'listed' | 'withdrawn';

/**
 * Derive an IPO's lifecycle phase from its timeline dates (single source of truth):
 *   before open → upcoming · open..close → live · after close → closed
 *   on/after allotment → allotment · on/after listing → listed. `withdrawn` wins if set.
 * Falls back to the stored status when dates are missing.
 */
export function ipoPhase(i: { status?: string; openDate?: string; closeDate?: string; allotmentDate?: string; listingDate?: string }): { phase: IpoPhase; label: string } {
  if (i.status === 'withdrawn') return { phase: 'withdrawn', label: 'Withdrawn' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const at = (s?: string) => { if (!s) return undefined; const d = new Date(s); d.setHours(0, 0, 0, 0); return d; };
  const open = at(i.openDate), close = at(i.closeDate), allot = at(i.allotmentDate), list = at(i.listingDate);
  if (list && today >= list) return { phase: 'listed', label: 'Listed' };
  if (allot && today >= allot) return { phase: 'allotment', label: 'Allotment' };
  if (close && today > close) return { phase: 'closed', label: 'Closed' };
  if (open && today < open) return { phase: 'upcoming', label: 'Upcoming' };
  if (open && close && today >= open && today <= close) return { phase: 'live', label: 'Live' };
  if (open && !close && today >= open) return { phase: 'live', label: 'Live' };
  const map: Record<string, { phase: IpoPhase; label: string }> = {
    open: { phase: 'live', label: 'Live' }, closed: { phase: 'closed', label: 'Closed' },
    listed: { phase: 'listed', label: 'Listed' }, upcoming: { phase: 'upcoming', label: 'Upcoming' },
  };
  return map[i.status ?? 'upcoming'] ?? { phase: 'upcoming', label: 'Upcoming' };
}
