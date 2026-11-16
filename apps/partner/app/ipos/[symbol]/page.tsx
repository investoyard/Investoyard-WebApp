import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import variant from '@variant';
import { loadIpos } from '@/core/data.server';
import { detailModel, detailSymbols } from '@/core/models';

export const dynamicParams = false;

export async function generateStaticParams() {
  return detailSymbols(await loadIpos()).map((symbol) => ({ symbol }));
}

async function find(symbol: string) {
  const s = decodeURIComponent(symbol);
  return (await loadIpos()).find((x) => x.symbol === s);
}

export async function generateMetadata({ params }: { params: { symbol: string } }): Promise<Metadata> {
  const ipo = await find(params.symbol);
  if (!ipo) return { title: 'IPO' };
  const m = detailModel(ipo);
  return { title: `${m.card.name} IPO`, description: `${m.card.name} IPO: price band ${m.card.band}, dates, subscription and allotment.` };
}

export default async function IpoPage({ params }: { params: { symbol: string } }) {
  const ipo = await find(params.symbol);
  if (!ipo) notFound();
  return <variant.DetailPage model={detailModel(ipo)} />;
}
