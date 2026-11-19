import type { ReactNode } from 'react';
import type { InfoHead } from '@/core/variant';
import { Hero } from './parts';

/* Prism: its hero band, then the content in a card that overlaps the band, as its other pages do. */
export default function InfoPage({ head, children }: { head: InfoHead; children: ReactNode }) {
  return (
    <>
      <Hero eyebrow={head.eyebrow} title={head.title} sub={head.sub} />
      <div className="p-wrap p-main">
        <section className="p-card" style={{ position: 'relative', zIndex: 2, marginTop: -46, padding: '28px 30px' }}>{children}</section>
      </div>
    </>
  );
}
