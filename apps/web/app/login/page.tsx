import { Suspense } from 'react';
import { LoginForm } from '@/components/LoginForm';

export const metadata = { title: 'Sign in | Investoyard' };

export default function LoginPage() {
  return (
    <div className="fade-up">
      <Suspense fallback={<div className="panel" style={{ maxWidth: 440, margin: '12px auto 0', height: 260 }} />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
