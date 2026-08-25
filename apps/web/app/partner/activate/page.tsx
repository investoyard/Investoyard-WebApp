import { Suspense } from 'react';
import { PartnerActivate } from '@/components/PartnerActivate';

export const metadata = { title: 'Activate your partner account | Investoyard', robots: { index: false, follow: false } };

export default function PartnerActivatePage() {
  return (
    <div className="container fade-up" style={{ paddingTop: 8 }}>
      <Suspense fallback={<div className="panel" style={{ maxWidth: 460, margin: '0 auto', height: 320 }} />}>
        <PartnerActivate />
      </Suspense>
    </div>
  );
}
