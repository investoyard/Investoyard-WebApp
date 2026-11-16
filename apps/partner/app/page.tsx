import variant from '@variant';
import { loadIpos } from '@/core/data.server';
import { homeModel } from '@/core/models';

export default async function Home() {
  const model = homeModel(await loadIpos());
  return <variant.HomePage model={model} />;
}
