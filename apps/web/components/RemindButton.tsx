'use client';
import { useEffect, useState } from 'react';
import { getIpoDetail } from '@/lib/api';
import { getConsumerToken, listWatchlist, addWatchlist, removeWatchlist } from '@/lib/consumer-api';
import { Icon } from '@/components/Icon';

/**
 * Set reminder — server-side watchlist subscription driving the hourly alert
 * sweep (open · closing soon · allotment day · listing day). One shared
 * watchlist fetch per page load, however many buttons render. Signed-out
 * users are sent to login with a return path.
 */

let wlPromise: Promise<Set<string>> | null = null;
function watchedIds(): Promise<Set<string>> {
  if (!wlPromise) {
    wlPromise = listWatchlist()
      .then((rows) => new Set(rows.map((r) => r.ipoId)))
      .catch(() => new Set<string>());
  }
  return wlPromise;
}

export function RemindButton({ symbol, ipoId, compact = false }: {
  symbol: string;
  /** live catalog id when the caller has it; else resolved from the symbol */
  ipoId?: string;
  compact?: boolean;
}) {
  const [id, setId] = useState<string | null>(ipoId ?? null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const signedIn = typeof window !== 'undefined' && !!getConsumerToken();

  useEffect(() => {
    let alive = true;
    const withId = id
      ? Promise.resolve(id)
      : getIpoDetail(symbol).then((d) => ((d as any)?.live && d?.id ? d.id : null));
    withId.then(async (resolved) => {
      if (!alive || !resolved) return;
      setId(resolved);
      if (signedIn) {
        const set = await watchedIds();
        if (alive) setOn(set.has(resolved));
      }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!signedIn) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; return; }
    if (!id || busy) return;
    setBusy(true);
    try {
      if (on) { await removeWatchlist(id); setOn(false); (await watchedIds()).delete(id); }
      else { await addWatchlist(id); setOn(true); (await watchedIds()).add(id); }
    } catch { /* leave state as-is */ }
    finally { setBusy(false); }
  };

  if (id === null && ipoId === undefined) return null; // demo/mock rows — no live id to subscribe to

  if (compact) {
    return (
      <button type="button" className={`rb-icon${on ? ' on' : ''}`} disabled={busy}
        title={on ? 'Reminder on — tap to remove' : 'Remind me (open · close · allotment · listing)'}
        aria-label={on ? `Remove reminder for ${symbol}` : `Set reminder for ${symbol}`}
        onClick={toggle}>
        <Icon name="bell" size={14} strokeWidth={on ? 2.4 : 2} />
      </button>
    );
  }
  return (
    <button type="button" className={`btn btn-block rb-btn${on ? ' on' : ''}`} disabled={busy} onClick={toggle}>
      <Icon name="bell" size={15} strokeWidth={on ? 2.4 : 2} />
      {on ? 'Reminder on — open · close · allotment' : 'Remind me — open · close · allotment'}
    </button>
  );
}
