import { getIpos } from '@/lib/api';
import { IpoExplorer } from '@/components/IpoExplorer';

export const metadata = {
  title: 'Recently Listed & Closed IPOs — Listing Performance | Investoyard',
  description: 'Recently listed and closed Mainboard & SME IPOs with allotment status and actual listing performance.',
};

export default async function ListedIposPage() {
  const ipos = await getIpos();
  return (
    <>
      <div className="trust-page" style={{ maxWidth: 'none', paddingBottom: 0 }}>
        <h1>Recently Listed &amp; Closed</h1>
        <p className="lead-p">Post-close issues — allotment, refunds and how the debut went. Full history on the <a className="linklike" href="/performance">Performance page</a>.</p>
      </div>
      <IpoExplorer ipos={ipos} initialStatus="closed" />
    </>
  );
}
