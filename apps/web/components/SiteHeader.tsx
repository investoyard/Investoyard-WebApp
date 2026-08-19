'use client';
import { useSearchParams } from 'next/navigation';
import { LangSwitcher } from '@/components/LangSwitcher';
import { NavLive } from '@/components/NavLive';
import { useStore } from '@/lib/store';
import { useTenant } from '@/components/TenantProvider';
import { makeT, Lang } from '@investoyard/i18n';

const CODES = ['en', 'hi', 'ta', 'te', 'bn', 'mr'];

export function SiteHeader() {
  const sp = useSearchParams();
  const lang = (CODES.includes(sp.get('lang') ?? '') ? sp.get('lang') : 'en') as Lang;
  const tr = makeT(lang);
  const q = lang !== 'en' ? `?lang=${lang}` : '';

  const tenant = useTenant();
  const mobile = useStore((s) => s.mobile);
  const profiles = useStore((s) => s.profiles);
  const self = profiles.find((p) => p.relationship === 'self');
  const initials = self?.fullName
    ? self.fullName.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : (mobile ? mobile.slice(-2) : '');

  return (
    <header className="header">
      <div className="header-inner">
        <a href={`/${q}`} className="brand-link" aria-label={`${tenant.name} home`}>
          {tenant.isDefault
            ? <img src="/investoyard-logo.svg" alt="Investoyard" height={26} style={{ display: 'block' }} />
            : tenant.logo
              ? <img src={tenant.logo} alt={tenant.name} height={26} style={{ display: 'block' }} />
              : <span className="brand-word">{tenant.name}</span>}
        </a>

        {/* live navigation — signals + the IPOs command panel */}
        <NavLive langQuery={q} />

        <div className="header-actions">
          <span className="lang-wrap"><LangSwitcher /></span>
          {mobile ? (
            <a href={`/account${q}`} className="avatar" aria-label="Your account" title={tr('apps.link')}>
              {initials || '★'}
            </a>
          ) : (
            <a href={`/login${q}`} className="btn btn-sm">Sign in</a>
          )}
        </div>
      </div>
    </header>
  );
}
