'use client';
import { ComingSoon } from '@/components/admin/ComingSoon';

/**
 * Bidding Summary — the operations matrix (IPO x member x channel).
 *
 * Deliberately still a placeholder. It counts rows in the BidOperation ledger,
 * which Phase 1 created but nothing has written to yet: no bid has been posted
 * because there is one member credential on file with no verified UAT run
 * behind it. Shipping the grid now would render a page of zeros and read as a
 * broken feature rather than an empty one.
 */
export default function Page() {
  return <ComingSoon title="Bidding Summary" icon="chart"
    sub="Bid, modify and delete counts per IPO and member, across NSE, BSE and file."
    points={[
      'Bid done / modify pending / modify done / delete pending / delete done, per exchange',
      'Grouped by IPO and member code — unposted bids counted under BYFILE',
      'Pending = operations recorded with us but not yet sent to an exchange',
    ]} />;
}
