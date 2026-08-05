'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader } from '@/components/ui/Loader';

/**
 * /admin → /admin/overview. A CLIENT-side redirect (not next/navigation's server
 * `redirect()`), because with `output: 'export'` a server redirect is baked into the
 * static HTML as a NEXT_REDIRECT digest that the client router can't resolve — hitting
 * /admin after login threw React #310. The admin layout also redirects /admin once
 * auth resolves; this is the belt-and-suspenders fallback.
 */
export default function AdminIndex() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/overview'); }, [router]);
  return <Loader full />;
}
