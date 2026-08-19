import { getIpos } from '@/lib/api';
import { IpoExplorer } from '@/components/IpoExplorer';

export const metadata = {
  title: 'SME IPOs — Live, Upcoming & Listed | Investoyard',
  description: 'Every NSE Emerge & BSE SME IPO — dates, lots, live subscription, GMP and listing performance, with UPI apply and printable forms.',
};

export default async function SmeIposPage() {
  const ipos = await getIpos();
  return (
    <>
      <div className="trust-page" style={{ maxWidth: 'none', paddingBottom: 0 }}>
        <h1>SME IPOs</h1>
        <p className="lead-p">The SME board — smaller issues, bigger lot sizes, its own demand rhythm.</p>
      </div>
      <IpoExplorer ipos={ipos} initialType="sme" />
    </>
  );
}
