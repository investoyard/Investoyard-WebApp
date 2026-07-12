'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LANGS } from '@investoyard/i18n';

const PATH_LOCALES = /^\/(hi)(?=\/|$)/; // locales with real SEO routes

export function LangSwitcher() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const sp = useSearchParams();
  const pathLocale = pathname.match(PATH_LOCALES)?.[1];
  const current = pathLocale ?? sp.get('lang') ?? 'en';

  return (
    <select
      aria-label="Language"
      value={current}
      onChange={(e) => {
        const next = e.target.value;
        const bare = pathname.replace(PATH_LOCALES, '') || '/';
        const isSeoPage = bare === '/' || bare.startsWith('/ipos');
        if (isSeoPage && (next === 'hi' || pathLocale)) {
          // Public content pages have real per-locale routes: / ↔ /hi/...
          router.push(next === 'en' ? bare : `/${next}${bare === '/' ? '/' : bare}`);
          return;
        }
        const params = new URLSearchParams(sp.toString());
        params.set('lang', next);
        router.push(`${bare}?${params.toString()}`);
      }}
      style={{
        font: 'inherit', color: 'var(--brand-primary)', background: 'var(--brand-primary-soft)',
        border: 'none', borderRadius: 980, padding: '6px 10px', fontWeight: 600, cursor: 'pointer',
      }}
    >
      {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  );
}
