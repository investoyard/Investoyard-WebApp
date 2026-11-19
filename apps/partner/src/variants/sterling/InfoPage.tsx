import type { ReactNode } from 'react';
import type { InfoHead } from '@/core/variant';

/* Sterling: the quiet page head its other pages use, then the content on the open page. */
export default function InfoPage({ head, children }: { head: InfoHead; children: ReactNode }) {
  return (
    <div className="s-wrap s-page">
      {head.eyebrow ? <p className="s-eyebrow">{head.eyebrow}</p> : null}
      <h1 className="s-ph1" style={head.eyebrow ? { marginTop: 10 } : undefined}>{head.title}</h1>
      <p className="s-plede">{head.sub}</p>
      <div style={{ marginTop: 36 }}>{children}</div>
    </div>
  );
}
