/**
 * An IPO's lifecycle status — derived from its dates, ONE rule for every surface.
 *
 * `Ipo.status` is NOT maintained: nobody advances it, so no row stores `open`.
 * It is not empty either — the historical import stored `listed` on ~1,170
 * rows, many with no listing date — so neither the column alone nor the dates
 * alone are right. The status has always been derived at read time, by a
 * function that existed twice (web `lib/api.ts`, mobile `lib/ipoCalc.ts`) and
 * not at all in the API — so the partner API reported the raw column until
 * 2026-11-20. This is that function, once.
 *
 * The status is never EARLIER than the dates prove (an issue whose close date
 * has passed cannot still be upcoming), and an explicit `withdrawn` always wins.
 * Dates are compared as India calendar days.
 */
import { istToday } from './ipoClock';

export type IpoLifecycleStatus = 'upcoming' | 'open' | 'closed' | 'listed' | 'withdrawn';

const ORDER = ['upcoming', 'open', 'closed', 'listed'];

/** A date column as its `YYYY-MM-DD` day; the columns hold UTC midnight of the India date. */
const dayOf = (d: string | Date | null | undefined): string | null =>
  d == null || d === '' ? null : (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);

export function effectiveIpoStatus(
  ipo: { status?: string | null; openDate?: string | Date | null; closeDate?: string | Date | null; listingDate?: string | Date | null },
  now: number = Date.now(),
): IpoLifecycleStatus {
  if (ipo.status === 'withdrawn') return 'withdrawn';
  const today = istToday(now);
  const open = dayOf(ipo.openDate), close = dayOf(ipo.closeDate), listing = dayOf(ipo.listingDate);
  let derived = 'upcoming';
  if (listing && today >= listing) derived = 'listed';
  else if (close && today > close) derived = 'closed';
  else if (open && today >= open) derived = 'open';
  const stored = String(ipo.status ?? 'upcoming');
  return (ORDER.indexOf(derived) > ORDER.indexOf(stored) ? derived : (ORDER.includes(stored) ? stored : derived)) as IpoLifecycleStatus;
}
