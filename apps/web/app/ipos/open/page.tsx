import { getIpos } from '@/lib/api';
import { IpoExplorer } from '@/components/IpoExplorer';

export const metadata = {
  title: 'Open IPOs Today — Apply Now | Investoyard',
  description: 'Every Mainboard & SME IPO open for bidding right now — dates, price band, live subscription and GMP, with UPI apply for you and your family.',
};

export default async function OpenIposPage() {
  const ipos = await getIpos();
  return (
    <>
      <div className="trust-page" style={{ maxWidth: 'none', paddingBottom: 0 }}>
        <h1>Open IPOs</h1>
        <p className="lead-p">Issues accepting bids right now.</p>
      </div>
      <IpoExplorer ipos={ipos} initialStatus="open" />
    </>
  );
}
