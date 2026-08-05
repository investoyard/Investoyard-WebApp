'use client';
import { ComingSoon } from '@/components/admin/ComingSoon';
export default function Page() {
  return <ComingSoon title="Failed / Retry" icon="refresh" sub="Failed submissions with reason and one-click retry."
    points={['Failed submissions with exchange reason', 'One-click retry', 'Auto-retry policy configuration']} />;
}
