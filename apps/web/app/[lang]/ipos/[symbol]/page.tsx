import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Lang } from '@investoyard/i18n';
import { getIpoDetail, ipoSymbols } from '@/lib/api';
import { priceBand } from '@/lib/format';
import { IpoDetailView, detailAlternates } from '@/components/views/IpoDetailView';
import { SUPPORTED_LOCALES } from '@/lib/locales';

export async function generateStaticParams() {
  const symbols = await ipoSymbols();
  return SUPPORTED_LOCALES.flatMap((lang) => symbols.map((symbol) => ({ lang, symbol })));
}

export async function generateMetadata({ params }: { params: { lang: string; symbol: string } }): Promise<Metadata> {
  const ipo = await getIpoDetail(params.symbol);
  return {
    // Hindi SEO title/description (native review pending — tracked human item).
    title: ipo ? `${ipo.name} IPO — प्राइस बैंड, तिथियाँ, GMP और सब्सक्रिप्शन | Investoyard` : 'IPO | Investoyard',
    description: ipo
      ? `${ipo.name} (${ipo.type === 'sme' ? 'SME' : 'मेनबोर्ड'}) IPO: प्राइस बैंड ${priceBand(ipo.priceBandMin, ipo.priceBandMax)}, लॉट ${ipo.lotSize ?? '—'}, लाइव सब्सक्रिप्शन और आवेदन की जानकारी।`
      : undefined,
    alternates: detailAlternates(params.symbol, params.lang as Lang),
  };
}

export default function LocalizedIpoDetail({ params }: { params: { lang: string; symbol: string } }) {
  if (!SUPPORTED_LOCALES.includes(params.lang as any)) notFound();
  return <IpoDetailView lang={params.lang as Lang} symbol={params.symbol} />;
}
