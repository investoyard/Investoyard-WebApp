import variant from '@variant';
import { loadIpos } from '@/core/data.server';
import { allotmentChoices, normalise } from '@/core/models';

export const metadata = { title: 'Check IPO allotment' };

export default async function Allotment() {
  return <variant.AllotmentPage choices={allotmentChoices((await loadIpos()).map(normalise))} />;
}
