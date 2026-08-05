'use client';
import { ComingSoon } from '@/components/admin/ComingSoon';
export default function Page() {
  return <ComingSoon title="UPI Mandates — Expired" icon="rupee" sub="Mandates that lapsed before approval."
    points={['Mandates expired before approval', 'Auto-flagged past the cut-off', 'Re-initiate option']} />;
}
