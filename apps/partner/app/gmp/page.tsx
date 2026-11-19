import { LABEL } from '@investoyard/shared-types';
import variant from '@variant';
import { GmpBody } from '@/core/content-client';
import { loadIpos } from '@/core/data.server';
import { gmpModel } from '@/core/models';

/* The address keeps "GMP" — it is the search term; the page says Exp. Premium, as everywhere else. */
export const metadata = { title: `IPO ${LABEL.gmp} (GMP)` };

export default async function Page() {
  return <variant.InfoPage head={{ eyebrow: 'IPOs', title: `IPO ${LABEL.gmp}`, sub: `The ${LABEL.gmpLong.toLowerCase()} reported for current and upcoming IPOs, where this site publishes it.` }}><GmpBody rows={gmpModel(await loadIpos())} ui={variant.ui} /></variant.InfoPage>;
}
