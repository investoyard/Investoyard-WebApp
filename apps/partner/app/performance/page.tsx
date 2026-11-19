import variant from '@variant';
import { PerformanceBody } from '@/core/content';
import { loadIpos } from '@/core/data.server';
import { performanceModel } from '@/core/models';

export const metadata = { title: 'IPO listing performance' };

export default async function Page() {
  const m = performanceModel(await loadIpos());
  return <variant.InfoPage head={{ eyebrow: 'IPOs', title: 'Listing performance', sub: 'How recent IPOs listed: issue price, listing price and final subscription.' }}><PerformanceBody rows={m.rows} held={m.held} ui={variant.ui} /></variant.InfoPage>;
}
