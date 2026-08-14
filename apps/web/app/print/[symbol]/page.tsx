import type { Metadata } from 'next';
import { getIpoDetail, ipoSymbols } from '@/lib/api';
import { PrintFlow } from '@/components/PrintFlow';

// One print page per catalog symbol — same static-params source as apply/detail.
export async function generateStaticParams() {
  const symbols = await ipoSymbols();
  return symbols.map((symbol) => ({ symbol }));
}

export async function generateMetadata({ params }: { params: { symbol: string } }): Promise<Metadata> {
  const ipo = await getIpoDetail(params.symbol);
  return { title: ipo ? `Print ASBA forms — ${ipo.name} IPO | Investoyard` : 'Print ASBA forms | Investoyard' };
}

export default async function PrintPage({ params }: { params: { symbol: string } }) {
  const ipo = await getIpoDetail(params.symbol);
  if (!ipo) {
    return <p className="muted" style={{ padding: '48px 0', textAlign: 'center' }}>IPO not found. <a className="linklike" href="/">← All IPOs</a></p>;
  }

  return <PrintFlow ipo={ipo} />;
}
