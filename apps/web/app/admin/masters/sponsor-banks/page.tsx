'use client';
import { MasterCrud } from '@/components/MasterCrud';

export default function SponsorBanksPage() {
  return (
    <MasterCrud
      kind="sponsor-banks"
      title="Sponsor Banks"
      sub="The bank carrying an issue's UPI mandate — set one per IPO on the IPO form. The EMAIL on each row is where an investor's unblock request goes when their funds are not released after allotment, so a row without one cannot receive those requests. Deactivate to hide from new IPOs."
      bulk
    />
  );
}
