import type { ReactNode } from 'react';
import type { InfoHead } from '@/core/variant';
import { Hero } from './parts';

/* Horizon: its tinted hero with drawn line art, then the content in one card. */
export default function InfoPage({ head, children }: { head: InfoHead; children: ReactNode }) {
  return (
    <>
      <Hero eyebrow={head.eyebrow || 'IPO research'} title={head.title} sub={head.sub} art="tower" />
      <div className="h-wrap h-main">
        <section className="h-card" style={{ padding: '28px 30px' }}>{children}</section>
      </div>
    </>
  );
}
