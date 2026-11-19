import type { ReactNode } from 'react';
import type { InfoHead } from '@/core/variant';
import { Hero } from './parts';

/* Bento: its page hero with a breadcrumb, then the content in one card. */
export default function InfoPage({ head, children }: { head: InfoHead; children: ReactNode }) {
  return (
    <>
      <Hero crumb={head.title} eyebrow={head.eyebrow} title={head.title} sub={head.sub} art="clipboard" />
      <div className="b-wrap b-main">
        <section className="b-card" style={{ padding: '28px 30px' }}>{children}</section>
      </div>
    </>
  );
}
