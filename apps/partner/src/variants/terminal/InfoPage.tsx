import type { ReactNode } from 'react';
import type { InfoHead } from '@/core/variant';

/* Terminal: the intro line every page opens with, then the content in a panel. */
export default function InfoPage({ head, children }: { head: InfoHead; children: ReactNode }) {
  return (
    <div className="t-page">
      <div className="t-intro"><div><h1>{head.title}</h1><p>{head.sub}</p></div></div>
      <section className="t-panel">
        <div className="t-pb" style={{ padding: '22px 24px' }}>{children}</div>
      </section>
    </div>
  );
}
