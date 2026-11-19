'use client';

import type { TenantPageKey } from '@investoyard/shared-types';
import { LEGAL_SUB, LegalBody, legalLabel } from '@/core/legal';

/* Terminal: the intro line every page opens with, then the text in a panel. */
export default function LegalPage({ page }: { page: TenantPageKey }) {
  return (
    <div className="t-page">
      <div className="t-intro"><div><h1>{legalLabel(page)}</h1><p>{LEGAL_SUB[page]}</p></div></div>
      <section className="t-panel">
        <div className="t-pb" style={{ padding: '22px 24px' }}>
          <LegalBody page={page} />
        </div>
      </section>
    </div>
  );
}
