'use client';
import { useEffect, useState } from 'react';
import { IpoForm } from '@/components/IpoForm';
import { Loader } from '@/components/ui/Loader';
export default function EditIpoPage() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { setId(new URLSearchParams(window.location.search).get('id')); }, []);
  if (!id) return <Loader />;
  return <IpoForm ipoId={id} />;
}
