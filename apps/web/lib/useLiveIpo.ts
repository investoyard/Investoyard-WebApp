'use client';
import { useEffect, useState } from 'react';
import { getIpoDetail, type IpoFull } from '@/lib/api';

/**
 * THE DETAIL PAGE IS A STATIC EXPORT, SO ITS SUBSCRIPTION FIGURES ARE FROZEN
 * AT THE LAST DEPLOY (operator report, 2026-10-21).
 *
 * `IpoDetailView` is a SERVER component: it calls `getIpoDetail` at build time
 * and hands the result down as props. Nothing on the page ever asks again. The
 * list pages have re-fetched on mount since the mock catalogue was removed and
 * `/subscription` re-fetches too, so the two surfaces drift apart the moment a
 * poll lands — measured on JPL twenty minutes after a build: QIB 2.71x on the
 * detail page against 3.38x live, Total 1.61x against 2.05x. On a page built
 * days ago it would be further out still, and it affects all 1,005 built pages.
 *
 * ONE FETCH, TWO CONSUMERS. The card and the sidebar's subscribed chip both
 * need the fresh record, and two components each fetching is two requests and
 * two chances to disagree. The in-flight promise is cached per symbol, so
 * whichever mounts first does the work and the other reads the same answer.
 *
 * THE SERVER RENDER IS KEPT. This returns null until the fetch lands and the
 * caller falls back to its baked props, so the HTML a crawler sees is still
 * the full page — the lesson from gating /terms on a client hook, which cost
 * us a legal page that view-source showed as empty.
 */
const inflight = new Map<string, Promise<IpoFull | undefined>>();

export function useLiveIpo(symbol: string | undefined | null): IpoFull | null {
  const [live, setLive] = useState<IpoFull | null>(null);

  useEffect(() => {
    const sym = String(symbol ?? '').trim();
    if (!sym) return;
    let alive = true;

    let p = inflight.get(sym);
    if (!p) {
      p = getIpoDetail(sym).catch(() => undefined);
      inflight.set(sym, p);
      /* Dropped once settled so a later mount re-reads rather than replaying a
         stale answer for the life of the tab — a reader can sit on an open
         issue's page for a long time. */
      void p.finally(() => { setTimeout(() => inflight.delete(sym), 30_000); });
    }
    void p.then((d) => { if (alive && d) setLive(d); });

    return () => { alive = false; };
  }, [symbol]);

  return live;
}
