import { Suspense } from 'react';
import { Account } from '@/components/Account';

export const metadata = { title: 'Profiles & family | Investoyard' };

export default function AccountPage() {
  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <Suspense fallback={null}>
        <Account />
      </Suspense>
    </div>
  );
}
