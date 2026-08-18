import { Suspense } from 'react';
import { getIpos } from '@/lib/api';
import { SubscriptionHub } from '@/components/SubscriptionHub';

export const metadata = {
  title: 'IPO Subscription Status Live — QIB, NII & Retail | Investoyard',
  description: 'Live category-wise subscription for every open Mainboard & SME IPO — QIB, NII and Retail demand with shares offered vs bid, updated through the day.',
};

export default async function SubscriptionPage() {
  const ipos = await getIpos();
  return (
    <Suspense fallback={null}>
      <SubscriptionHub ipos={ipos as any} />
    </Suspense>
  );
}
