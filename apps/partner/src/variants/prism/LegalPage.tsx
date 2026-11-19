'use client';

import type { TenantPageKey } from '@investoyard/shared-types';
import { LEGAL_SUB, LegalBody, legalLabel } from '@/core/legal';
import { Hero } from './parts';

/* Prism: its hero band, then the text in a card that overlaps the band, as its other pages do. */
export default function LegalPage({ page }: { page: TenantPageKey }) {
  return (
    <>
      <Hero eyebrow="Legal" title={legalLabel(page)} sub={LEGAL_SUB[page]} />
      <div className="p-wrap p-main">
        <section className="p-card" style={{ position: 'relative', zIndex: 2, marginTop: -46, padding: '28px 30px' }}>
          <LegalBody page={page} />
        </section>
      </div>
    </>
  );
}
