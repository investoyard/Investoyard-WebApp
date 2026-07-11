import { Suspense } from 'react';
import { Portfolio } from '@/components/Portfolio';

export const metadata = { title: 'Portfolio | Investoyard' };

export default function PortfolioPage() {
  return (
    <Suspense fallback={null}>
      <Portfolio />
    </Suspense>
  );
}
