'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LANGS } from '@investoyard/i18n';

export function LangSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = sp.get('lang') ?? 'en';

  return (
    <select
      aria-label="Language"
      value={current}
      onChange={(e) => {
        const params = new URLSearchParams(sp.toString());
        params.set('lang', e.target.value);
        router.push(`${pathname}?${params.toString()}`);
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
