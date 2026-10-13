import { Suspense } from 'react';
import { getIpos, type IpoFull } from '@/lib/api';
import { NseIpoLanding } from '@/components/NseIpoLanding';

export const metadata = {
  title: 'NSE IPO Live Subscription — National Stock Exchange of India | Investoyard',
  description:
    'Live subscription tracker for the National Stock Exchange of India (NSE) IPO — category-wise book size, subscription and times, updated through the day.',
};

/**
 * /subscription/v2 — Dedicated landing page for the National Stock Exchange
 * of India IPO (symbol `NSE`). Server picks that single issue from the live
 * catalogue and hands it to the client landing component; if the row is
 * missing (rare — the IPO hasn't been created yet, or has been removed),
 * the landing renders its own empty state.
 */
export default async function NseSubscriptionPage() {
  const ipos = await getIpos();
  const nse = ipos.find((i: any) => (i.symbol ?? '').toUpperCase() === 'NSE') ?? null;
  return (
    <Suspense fallback={null}>
      <NseIpoLanding ipo={nse as IpoFull | null} />
    </Suspense>
  );
}
