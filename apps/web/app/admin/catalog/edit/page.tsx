'use client';
import { useEffect, useState } from 'react';
import { IpoForm } from '@/components/IpoForm';
export default function EditIpoPage() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { setId(new URLSearchParams(window.location.search).get('id')); }, []);
  if (!id) return <div className="muted" style={{ padding: 20 }}>Loading…</div>;
  return <IpoForm ipoId={id} />;
}
