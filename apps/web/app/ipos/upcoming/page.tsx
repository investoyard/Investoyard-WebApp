import { getIpos } from '@/lib/api';
import { IpoExplorer } from '@/components/IpoExplorer';

export const metadata = {
  title: 'Upcoming IPOs — Dates & Price Bands | Investoyard',
  description: 'Every upcoming Mainboard & SME IPO in India with expected dates, price bands, lot sizes and GMP — set up before the issue opens.',
};

export default async function UpcomingIposPage() {
  const ipos = await getIpos();
  return (
    <>
      <div className="trust-page" style={{ maxWidth: 'none', paddingBottom: 0 }}>
        <h1>Upcoming IPOs</h1>
        <p className="lead-p">What opens next — dates, bands and lots as they are announced.</p>
      </div>
      <IpoExplorer ipos={ipos} initialStatus="upcoming" />
    </>
  );
}
