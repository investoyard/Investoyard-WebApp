'use client';

import type { TenantPageKey } from '@investoyard/shared-types';
import { LEGAL_SUB, LegalBody, legalLabel } from '@/core/legal';
import { Hero } from './parts';

/* Bento: its page hero, then the text in one card. */
export default function LegalPage({ page }: { page: TenantPageKey }) {
  return (
    <>
      <Hero crumb={legalLabel(page)} title={legalLabel(page)} sub={LEGAL_SUB[page]} art="clipboard" />
      <div className="b-wrap b-main">
        <section className="b-card" style={{ padding: '28px 30px' }}>
          <LegalBody page={page} />
        </section>
      </div>
    </>
  );
}
