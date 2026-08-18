import { Suspense } from 'react';
import { getIpos } from '@/lib/api';
import { GmpHub } from '@/components/GmpHub';

export const metadata = {
  title: 'IPO GMP Today — Live Grey Market Premium | Investoyard',
  description: 'Grey-market premium for every Mainboard & SME IPO — GMP in ₹, the % it implies over the price band, and the indicative listing price.',
};

export default async function GmpPage() {
  const ipos = await getIpos();
  return (
    <Suspense fallback={null}>
      <GmpHub ipos={ipos as any} />
    </Suspense>
  );
}
