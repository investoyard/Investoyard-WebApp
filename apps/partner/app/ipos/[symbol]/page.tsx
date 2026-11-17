import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import variant from '@variant';
import { loadIpos } from '@/core/data.server';
import { detailModel, detailSymbols, otherIposPool, type IpoCard } from '@/core/models';

export const dynamicParams = false;

export async function generateStaticParams() {
  return detailSymbols(await loadIpos()).map((symbol) => ({ symbol }));
}

/* The "other IPOs" pool is the same for every page, so it is worked out once per build, not per page. */
let pool: Promise<IpoCard[]> | null = null;
const others = () => (pool = pool || loadIpos().then(otherIposPool));

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
  return <variant.DetailPage model={detailModel(ipo, await others())} />;
}
