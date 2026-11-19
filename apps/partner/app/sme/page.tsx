import variant from '@variant';
import { loadIpos } from '@/core/data.server';
import { archiveModel, LIST_PRESETS, presetIpos } from '@/core/models';

/* investoyard.com's own address for this list, answered in the partner's design. */
export const metadata = { title: LIST_PRESETS.sme.title };

export default async function Page() {
  return <variant.ArchivePage rows={archiveModel(presetIpos(await loadIpos(), 'sme'))} heading={LIST_PRESETS.sme} />;
}
