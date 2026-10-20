import { Suspense } from 'react';
import { SignupForm } from '@/components/SignupForm';

export const metadata = {
  title: 'Create your account | Investoyard',
  description: 'Open a free Investoyard account to apply for mainboard and SME IPOs with your own PAN, demat and bank account.',
};

export default function SignupPage() {
  return (
    <div className="fade-up">
      <Suspense fallback={<div className="panel" style={{ maxWidth: 440, margin: '12px auto 0', height: 320 }} />}>
        <SignupForm />
      </Suspense>
    </div>
  );
}
