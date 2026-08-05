'use client';
import { ComingSoon } from '@/components/admin/ComingSoon';
export default function Page() {
  return <ComingSoon title="Bid Queue" icon="exchange" sub="Live view of bids queued to the exchange rail."
    points={['Bids queued to NSE / BSE in real time', 'Family (batch) grouping', 'Status and timestamps per bid']} />;
}
