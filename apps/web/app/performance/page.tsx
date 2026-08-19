import { Suspense } from 'react';
import { getIpos } from '@/lib/api';
import { PerformanceHub } from '@/components/PerformanceHub';

export const metadata = {
  title: 'IPO Performance — Listing Gains of Every Debut | Investoyard',
  description: 'Issue price vs actual listing price and listing gain for every recent Mainboard & SME IPO, sortable by best and worst debuts.',
};

export default async function PerformancePage() {
  const ipos = await getIpos();
  return (
    <Suspense fallback={null}>
      <PerformanceHub ipos={ipos as any} />
    </Suspense>
  );
}
