'use client';
import { useSearchParams } from 'next/navigation';
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
  /* The ACCOUNT HOLDER's initials, never an applicant's. This read the first
     profile whose relationship was 'self', and until 2026-10-20 the store minted
     a demo "Rahul Sharma" into every browser on sign-in — so the avatar read
     "RS" for every customer on the site. The name is the one the server issued
     with the session. */
  const name = useStore((s) => s.name);
  const initials = name?.trim()
    ? name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
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
          {/* LANGUAGE SWITCHER HIDDEN (operator, 2026-10-22). Only the CONTROL
              is gone: /hi pages are still built, still in the sitemap and still
              carry their hreflang alternates, and ?lang=hi still resolves — so
              visitors arriving from search are unaffected. Restore this one line
              when the Hindi translation pass lands; the component is untouched.
              <span className="lang-wrap"><LangSwitcher /></span> */}
          {mobile ? (
            <a href={`/account${q}`} className="avatar" aria-label="Your account" title={tr('apps.link')}>
              {initials || '★'}
            </a>
          ) : (
            /* Sign up is the primary of the two: the site had only a Sign in
               button, and signing in with an unknown number used to create the
               account silently — so new visitors had no door of their own. */
            <span className="auth-pair">
              <a href={`/login${q}`} className="btn btn-ghost btn-sm">Sign in</a>
              <a href={`/signup${q}`} className="btn btn-sm">Sign up</a>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
