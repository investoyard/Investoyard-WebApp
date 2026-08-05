'use client';
import { ComingSoon } from '@/components/admin/ComingSoon';
export default function Page() {
  return <ComingSoon title="Allotment List" icon="receipt" sub="Allotted vs applied by IPO, with verification state."
    points={['Allotted vs applied per IPO', 'Verified / pending state', 'Export for reconciliation']} />;
}
