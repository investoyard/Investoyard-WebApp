/**
 * ONE ANSWER TO "IS THIS IPO WATCHED", shared by every bell and by the
 * watchlist screen.
 *
 * This cache was module-level state inside `components/RemindBell.tsx`, which
 * was fine while the bell was the only thing that could change it — `toggle`
 * mutates the cached Set on its way through. It stops being fine the moment a
 * second surface can remove a row: the screen would drop it server-side and
 * every bell already mounted would go on showing a lit reminder, because
 * nothing had told them. Two views of one list that can disagree is the bug.
 *
 * It lives in `lib` rather than beside the bell because a SCREEN importing
 * state out of a component is backwards, and the next consumer would copy it.
 */
import { addWatchlist, listWatchlist, removeWatchlist } from './api';

let promise: Promise<Set<string>> | null = null;
let forToken: string | null = null;

/**
 * The watched ipo ids, fetched ONCE per app session however many bells render.
 * Keyed on the token, so signing in as somebody else cannot inherit the
 * previous account's list.
 */
export function watchedIds(token: string): Promise<Set<string>> {
  if (!promise || forToken !== token) {
    forToken = token;
    promise = listWatchlist(token)
      .then((rows) => new Set(rows.map((r) => r.ipoId)))
      .catch(() => new Set<string>());
  }
  return promise;
}

/** Drop the cache so the next read goes to the server — for pull-to-refresh. */
export function invalidateWatched(): void {
  promise = null;
  forToken = null;
}

/**
 * Record a change every reader should see, without a round trip.
 *
 * It AWAITS the cache rather than firing and forgetting: mutating a Set that
 * has not resolved yet would be overwritten by the fetch landing a moment
 * later, which is the race that makes an optimistic toggle flicker back.
 */
export async function noteWatched(token: string, ipoId: string, on: boolean): Promise<void> {
  const set = await watchedIds(token);
  if (on) set.add(ipoId);
  else set.delete(ipoId);
}

/**
 * Add or remove, keeping the shared cache in step, and report whether the
 * SERVER agreed. A caller showing an optimistic state reverts on false.
 */
export async function setWatched(token: string, ipoId: string, on: boolean): Promise<boolean> {
  const ok = on ? await addWatchlist(token, ipoId) : await removeWatchlist(token, ipoId);
  if (ok) await noteWatched(token, ipoId, on);
  return ok;
}
