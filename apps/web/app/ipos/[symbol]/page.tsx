import type { Metadata } from 'next';
import { getIpoDetail, ipoUrlHandles } from '@/lib/api';
import { priceBand } from '@/lib/format';
import { IpoDetailView, detailAlternates } from '@/components/views/IpoDetailView';

/**
 * The URL segment used to be the IPO SYMBOL (`GLASSWALL`). It's now
 * SEO-friendly slugs (`glasswall-technologies-ipo`) for internal links —
 * but the folder name stays `[symbol]` so external bookmarks to
 * `/ipos/SYMBOL` keep resolving. The API's getBySymbol accepts either
 * shape and the static export emits BOTH so both URLs 200 statically.
 * Canonical always points to the slug form.
 */
export async function generateStaticParams() {
  return (await ipoUrlHandles()).map((symbol) => ({ symbol }));
}

export async function generateMetadata({ params }: { params: { symbol: string } }): Promise<Metadata> {
  const ipo = await getIpoDetail(params.symbol);
  // Canonical URL uses the slug form — Google consolidates SEO onto the
  // clean URL even when a visitor lands via the legacy /ipos/SYMBOL link.
  const canonicalHandle = ipo?.slug ?? ipo?.symbol ?? params.symbol;
  return {
    title: ipo ? `${ipo.name} IPO — price, dates, GMP & subscription | Investoyard` : 'IPO | Investoyard',
    description: ipo
      ? `${ipo.name} (${ipo.type === 'sme' ? 'SME' : 'Mainboard'}) IPO: ${priceBand(ipo.priceBandMin, ipo.priceBandMax)} price band, lot ${ipo.lotSize ?? '—'}, live subscription, allotment and how to apply.`
      : undefined,
    alternates: detailAlternates(canonicalHandle, 'en'),
  };
}

export default function IpoDetailPage({ params }: { params: { symbol: string } }) {
  return <IpoDetailView lang="en" symbol={params.symbol} />;
}
