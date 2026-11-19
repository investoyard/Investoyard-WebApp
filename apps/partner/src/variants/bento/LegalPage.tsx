'use client';

import type { TenantPageKey } from '@investoyard/shared-types';
import { LEGAL_SUB, LegalBody, legalLabel } from '@/core/legal';
import InfoPage from './InfoPage';

/* The partner's own legal text in this design's page frame. */
export default function LegalPage({ page }: { page: TenantPageKey }) {
  return (
    <InfoPage head={{ title: legalLabel(page), sub: LEGAL_SUB[page] }}>
      <LegalBody page={page} />
    </InfoPage>
  );
}
