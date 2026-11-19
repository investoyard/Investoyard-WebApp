'use client';

import type { TenantPageKey } from '@investoyard/shared-types';
import { LEGAL_SUB, LegalBody, legalLabel } from '@/core/legal';
import { Hero } from './parts';

/* Horizon: its tinted hero with drawn line art, then the text in one card. */
export default function LegalPage({ page }: { page: TenantPageKey }) {
  return (
    <>
      <Hero eyebrow="Legal" title={legalLabel(page)} sub={LEGAL_SUB[page]} art="tower" />
      <div className="h-wrap h-main">
        <section className="h-card" style={{ padding: '28px 30px' }}>
          <LegalBody page={page} />
        </section>
      </div>
    </>
  );
}
