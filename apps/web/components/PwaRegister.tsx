'use client';
import { useEffect } from 'react';

/** Registers the service worker (secure context only — HTTPS or localhost). */
export function PwaRegister() {
  useEffect(() => {
    // Only run the SW in production builds — in `next dev` it caches dev chunks
    // and causes stale-module ("reading 'call'") errors after recompiles.
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ });
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
