import type { Metadata } from 'next';
import { getIpoDetail, mockIpos } from '@/lib/api';
import { priceBand } from '@/lib/format';
import { IpoDetailView, detailAlternates } from '@/components/views/IpoDetailView';

export function generateStaticParams() {
  return mockIpos().map((i) => ({ symbol: i.symbol }));
}

export async function generateMetadata({ params }: { params: { symbol: string } }): Promise<Metadata> {
  const ipo = await getIpoDetail(params.symbol);
  return {
    title: ipo ? `${ipo.name} IPO — price, dates, GMP & subscription | Investoyard` : 'IPO | Investoyard',
    description: ipo
      ? `${ipo.name} (${ipo.type === 'sme' ? 'SME' : 'Mainboard'}) IPO: ${priceBand(ipo.priceBandMin, ipo.priceBandMax)} price band, lot ${ipo.lotSize ?? '—'}, live subscription, allotment and how to apply.`
      : undefined,
    alternates: detailAlternates(params.symbol, 'en'),
  };
}

export default function IpoDetailPage({ params }: { params: { symbol: string } }) {
  return <IpoDetailView lang="en" symbol={params.symbol} />;
}
