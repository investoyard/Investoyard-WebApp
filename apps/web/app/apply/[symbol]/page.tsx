import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getIpoDetail, mockIpos } from '@/lib/api';
import { ApplyWizard } from '@/components/ApplyWizard';
import { makeT, Lang } from '@investoyard/i18n';

export function generateStaticParams() {
  return mockIpos().map((i) => ({ symbol: i.symbol }));
}

export async function generateMetadata({ params }: { params: { symbol: string } }): Promise<Metadata> {
  const ipo = await getIpoDetail(params.symbol);
  return { title: ipo ? `Apply — ${ipo.name} IPO | Investoyard` : 'Apply | Investoyard' };
}

export default async function ApplyPage({ params }: { params: { symbol: string } }) {
  const lang: Lang = 'en';
  const tr = makeT(lang);
  const q = '';
  const ipo = await getIpoDetail(params.symbol);

  if (!ipo) {
    return <p className="muted">{tr('detail.notFound')} <a className="linklike" href={`/${q}`}>← All IPOs</a></p>;
  }

  return (
    <Suspense fallback={null}>
      <ApplyWizard ipo={ipo} lang={lang} />
    </Suspense>
  );
}
