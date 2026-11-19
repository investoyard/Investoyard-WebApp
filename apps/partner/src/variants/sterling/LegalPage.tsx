'use client';

import type { TenantPageKey } from '@investoyard/shared-types';
import { LEGAL_SUB, LegalBody, legalLabel } from '@/core/legal';

/* Sterling: the same quiet page head as its other pages, then the text on the open page. */
export default function LegalPage({ page }: { page: TenantPageKey }) {
  return (
    <div className="s-wrap s-page">
      <h1 className="s-ph1">{legalLabel(page)}</h1>
      <p className="s-plede">{LEGAL_SUB[page]}</p>
      <div style={{ marginTop: 36 }}><LegalBody page={page} /></div>
    </div>
  );
}
