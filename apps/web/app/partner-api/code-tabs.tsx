'use client';
import { useEffect, useState } from 'react';
import { LANGS, type Lang } from '@/lib/partnerApiDocs';

const KEY = 'iy.apidocs.lang';

/**
 * Request examples in five languages, one at a time on screen. EVERY panel is in
 * the markup and CSS hides the unselected ones, so the server render carries the
 * code for search engines and readers without JavaScript.
 *
 * In PRINT only cURL appears, whichever tab was open: each sample repeats the
 * whole request body, and five of them on fresh pages took the PDF from 6
 * pages to 10 with a near-empty last page. A print-only line points to the rest.
 * The choice is shared with the admin API Docs page and remembered.
 */
export function PaCodeTabs({ samples }: { samples: Record<Lang, string> }) {
  const [lang, setLang] = useState<Lang>('curl');
  useEffect(() => { try { const l = localStorage.getItem(KEY) as Lang | null; if (l && LANGS.some((x) => x.id === l)) setLang(l); } catch { /* private window */ } }, []);
  const pick = (l: Lang) => { setLang(l); try { localStorage.setItem(KEY, l); } catch { /* ignore */ } };
  return (
    <div className="pa-code pa-tabs">
      <div className="pa-code-head pa-tabs-head pa-noprint" role="tablist" aria-label="Language">
        {LANGS.map((l) => (
          <button key={l.id} type="button" role="tab" aria-selected={lang === l.id} className={lang === l.id ? 'on' : ''} onClick={() => pick(l.id)}>{l.label}</button>
        ))}
      </div>
      {LANGS.map((l) => (
        <div key={l.id} className={`pa-tab-panel${lang === l.id ? ' on' : ''}${l.id === 'curl' ? ' pa-tab-print' : ''}`}>
          <div className="pa-tab-print-label">{l.label}</div>
          <pre>{samples[l.id]}</pre>
        </div>
      ))}
      <p className="pa-tab-print-note">The same request in Node.js, Python, PHP and Java is in API Docs in your partner admin.</p>
    </div>
  );
}
