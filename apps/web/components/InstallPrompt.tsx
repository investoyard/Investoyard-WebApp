'use client';
import { useEffect, useState } from 'react';
import { useTenant } from '@/components/TenantProvider';
import { tenantDisplayName } from '@/lib/tenants';

const KEY = 'investoyard.pwa.dismissed';

/** Custom top-center install banner. Uses beforeinstallprompt on Chromium; shows
    manual "Add to Home Screen" guidance on iOS Safari. Hidden if installed/dismissed. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [mode, setMode] = useState<'none' | 'prompt' | 'ios'>('none');
  /* our own name on our own channel, the partner's on theirs */
  const tenant = useTenant();
  const name = tenantDisplayName(tenant);
  const own = !!tenant.isDefault;

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    if (standalone) return;
    try { if (localStorage.getItem(KEY) === '1') return; } catch { /* ignore */ }

    const onBip = (e: Event) => { e.preventDefault(); setDeferred(e); setMode('prompt'); };
    window.addEventListener('beforeinstallprompt', onBip);

    const onInstalled = () => { setMode('none'); try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } };
    window.addEventListener('appinstalled', onInstalled);

    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (isIOS && isSafari) t = setTimeout(() => setMode((m) => (m === 'none' ? 'ios' : m)), 1800);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
      if (t) clearTimeout(t);
    };
  }, []);

  function dismiss() { setMode('none'); try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
    setMode('none');
  }

  if (mode === 'none') return null;

  return (
    <div className="install-banner" role="dialog" aria-label={`Install ${name}`}>
      {/* OUR MARK IS HIDDEN ON A PARTNER'S SITE RATHER THAN SWAPPED: there is no
          partner icon to put here, and the house rule is to say nothing rather
          than fall back to ours. (The installed app still carries our icon via
          the manifest — a partner needs their own, which is a gap of its own.) */}
      {own && <img className="ib-mark" src="/icon.svg" alt={name} width={40} height={40} />}
      <div className="ib-text">
        <strong>Install {name}</strong>
        <span>
          {mode === 'ios'
            ? <>Tap <b>Share</b> then <b>“Add to Home Screen”</b>.</>
            : 'Add it to your home screen for quick, app-like access.'}
        </span>
      </div>
      {mode === 'prompt' && <button className="btn btn-sm" onClick={install}>Install</button>}
      <button className="ib-x" aria-label="Dismiss" onClick={dismiss}>×</button>
    </div>
  );
}
