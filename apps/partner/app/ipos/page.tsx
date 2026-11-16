import variant from '@variant';
import { loadIpos } from '@/core/data.server';
import { archiveModel } from '@/core/models';

export const metadata = { title: 'All IPOs' };

export default async function Archive() {
  return <variant.ArchivePage rows={archiveModel(await loadIpos())} />;
}
