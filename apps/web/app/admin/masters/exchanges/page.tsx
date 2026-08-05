'use client';
import { ComingSoon } from '@/components/admin/ComingSoon';
export default function Page() {
  return <ComingSoon title="Exchanges" icon="exchange" sub="NSE / BSE segment and session configuration."
    points={['NSE / BSE exchange masters', 'Series, segment & session config', 'Feeds the bidding rail']} />;
}
