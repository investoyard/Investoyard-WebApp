'use client';
import { useEffect, useRef, useState } from 'react';
import { getConsumerToken } from '../lib/consumer-api';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

/** How often a tab says "still here". The server counts anyone seen in 75s. */
const HEARTBEAT_MS = 30_000;

/**
 * THE LINE ONLY APPEARS WITH A REAL CROWD (operator's call, 2026-10-21).
 *
 * Measured before building: the busiest day on these pages so far was 59
 * distinct visitors spread over the whole day, so the concurrent number is
 * almost always 0, 1 or 2 — and "1 person viewing now" is the reader
 * themselves, which reads forlorn on a page about the biggest IPO in the
 * country. Below this it says nothing at all, which is the honest silence a
 * quiet page deserves. We do not pad the number to reach it.
 */
const SHOW_FROM = 3;

/**
 * Reports a page view and shows how many people are reading it.
 *
 * WHY THE BROWSER HAS TO DO THIS: the site is a static export served by IIS.
 * There is no server render, no middleware, nothing on our side that sees a
 * page view — so the only way to know a page was read is for the page to say
 * so. It posts once on mount and then heartbeats.
 *
 * THE HEARTBEAT STOPS WHEN THE TAB IS HIDDEN, and that is not a nicety: a
 * reader with this page parked in a background tab all afternoon would
 * otherwise be counted as present all afternoon, and the live figure would
 * drift upwards from people who left. `visibilitychange` is also the only
 * reliable signal here — `requestAnimationFrame` does not fire in a hidden
 * tab at all, which this project has been caught by before.
 *
 * NOTHING IS STORED ON THE DEVICE. No cookie, no localStorage, no identifier.
 * The server derives a visitor from a salt that rotates at IST midnight, so
 * nothing we write can follow a reader from one day to the next.
 *
 * IT SENDS THE SESSION TOKEN WHEN THERE IS ONE (operator ask, 2026-10-21:
 * *"if user login then his identity with IP"*). An anonymous reader is
 * unaffected — no token, nothing to send — and the endpoint stays public, so
 * a token that is missing, stale or malformed simply means anonymous rather
 * than a refused beacon.
 */
export function VisitorBeacon({ path, symbol }: { path: string; symbol?: string | null }) {
  const [live, setLive] = useState(0);
  /* The symbol changes as the reader switches issue on /subscription/v2, and
     the effect must not restart the timer each time — it reads this instead. */
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const ping = async () => {
      if (stopped || document.hidden) return;
      try {
        /* READ FRESH ON EVERY PING, not once on mount: a reader can sign in
           or out while the page is open, and the heartbeat should follow them
           rather than keep reporting whichever state the tab opened in. */
        const token = getConsumerToken();
        const res = await fetch(`${API}/metrics/view`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ path, symbol: symbolRef.current ?? '' }),
          /* `omit` still: the identity rides on the Authorization header the
             API already uses everywhere, and no cookie is sent. */
          credentials: 'omit',
          keepalive: true,
        });
        if (!res.ok) return;
        const j = await res.json();
        if (!stopped && typeof j?.live === 'number') setLive(j.live);
      } catch {
        /* A page view is not worth a visible failure. The reader came here to
           read subscription figures. */
      }
    };

    const start = () => {
      if (timer) return;
      void ping();
      timer = setInterval(ping, HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [path]);

  if (live < SHOW_FROM) return null;
  return (
    <p className="subv2-live" aria-live="polite">
      <span className="subv2-live-dot" aria-hidden="true" />
      {live.toLocaleString('en-IN')} people viewing this page now
    </p>
  );
}
