'use client';

import { useState } from 'react';
import { Icon } from './parts';

/* Share uses the device's share sheet where there is one, and copies the link otherwise. */
export default function ShareButton({ title }: { title: string }) {
  const [done, setDone] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch { /* the reader closed the share sheet */ }
  };
  return (
    <button type="button" className="p-btn p-btn-q" onClick={share}>
      <Icon name="share" size={18} />{done ? 'Link copied' : 'Share'}
    </button>
  );
}
