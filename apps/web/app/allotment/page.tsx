import { Suspense } from 'react';
import { getIpos } from '@/lib/api';
import { AllotmentChecker } from '@/components/AllotmentChecker';

export const metadata = {
  title: 'IPO Allotment Status Check — by PAN | Investoyard',
  description: 'Check your IPO allotment status instantly by PAN for recent Mainboard & SME issues, and learn how the basis of allotment works.',
};

export default async function AllotmentPage() {
  const ipos = await getIpos();
  return (
    <div className="trust-page">
      <h1>Check IPO Allotment</h1>
      <p className="lead-p">Pick the issue, enter the applicant&apos;s PAN — instant status for applications made on Investoyard.</p>

      <div className="panel" style={{ padding: 20, marginTop: 18 }}>
        <Suspense fallback={null}>
          <AllotmentChecker ipos={ipos as any} />
        </Suspense>
      </div>

      <div className="prose">
        <h2>How allotment works</h2>
        <p>
          After an issue closes, the registrar finalises the <b>basis of allotment</b> — usually within a working day
          or two. When an issue is oversubscribed in the retail category, allotment happens by <b>computerised lottery</b>
          at one lot per selected applicant; larger categories are allotted proportionately. Allotted shares are
          credited to the applicant&apos;s demat account before listing, and ASBA blocks for unallotted applications are
          released automatically — the money never left the account.
        </p>
        <h2>Applied elsewhere?</h2>
        <p>
          This checker covers applications made on Investoyard. If you applied through a bank or another platform, use
          the issue registrar&apos;s own status page with the same PAN —
          {' '}<a href="https://linkintime.co.in" target="_blank" rel="noopener noreferrer">MUFG Intime (Link Intime)</a>,
          {' '}<a href="https://kfintech.com" target="_blank" rel="noopener noreferrer">KFin Technologies</a> or
          {' '}<a href="https://www.bigshareonline.com" target="_blank" rel="noopener noreferrer">Bigshare Services</a>,
          depending on the issue — or the exchange&apos;s allotment page.
        </p>
      </div>
    </div>
  );
}
