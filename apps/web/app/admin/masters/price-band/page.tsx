'use client';
import { ComingSoon } from '@/components/admin/ComingSoon';
export default function Page() {
  return <ComingSoon title="Price Band Master" icon="trending" sub="Reusable price bands, tick sizes and cut-off handling."
    points={['Reusable price bands & tick sizes', 'Cut-off price handling', 'Linked into IPO Add / Edit']} />;
}
