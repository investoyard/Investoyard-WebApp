import { getIpos, getPosts } from '@/lib/api';
import { HomeNews } from '@/components/HomeNews';
import { IpoExplorer } from '@/components/IpoExplorer';
import { IpoExplorer2 } from '@/components/IpoExplorer2';
import { HeroBanner } from '@/components/HeroBanner';
import { TodayStrip } from '@/components/TodayStrip';
import { GmpAccuracy } from '@/components/GmpAccuracy';
import { AllotmentChecker } from '@/components/AllotmentChecker';
import { WhatsAppCta } from '@/components/WhatsAppCta';
import { Icon } from '@/components/Icon';
import { Lang } from '@investoyard/i18n';

/** Locale-parameterized home view — rendered at `/` (en) and `/[lang]/` (SEO routes). */
export async function HomeView({ lang, v2 = false }: { lang: Lang; v2?: boolean }) {
  const ipos = await getIpos();
  const posts = await getPosts(3);
  const q = lang === 'en' ? '' : `?lang=${lang}`; // app-page links keep the query form

  return (
    <>
      {/* ---------- compact dynamic banner (auto IPO slides + brand slide) ---------- */}
      <HeroBanner ipos={ipos as any} lang={lang} />

      {/* ---------- today strip: the market's pulse in one line ----------
           v2 folds these counts into the explorer's market bar, so the
           standalone strip would repeat them. */}
      {!v2 && <TodayStrip ipos={ipos as any} langQuery={q} />}

      {/* ---------- IPO EXPLORER ---------- */}
      {v2 ? <IpoExplorer2 ipos={ipos} lang={lang} /> : <IpoExplorer ipos={ipos} lang={lang} />}

      {/* ---------- allotment checker: did you get the shares? ---------- */}
      <div className="panel ac-band fade-up">
        <AllotmentChecker ipos={ipos as any} compact />
      </div>

      {/* ---------- GMP accuracy: final GMP vs actual listing gain ---------- */}
      <GmpAccuracy ipos={ipos as any} />

      {/* ---------- latest news (hidden until something is published) ---------- */}
      <HomeNews posts={posts} />

      {/* ---------- WhatsApp updates (renders once the channel URL is configured) ---------- */}
      <WhatsAppCta />

      {/* ---------- HOW IT WORKS ---------- */}
      <div className="section-head">
        <h2>Apply in four steps</h2>
        <a className="linklike" href={`/login${q}`}>Get started →</a>
      </div>
      <div className="steps-band">
        {[
          { t: 'Pick an IPO', d: 'Browse live Mainboard & SME issues with dates, subscription and GMP.' },
          { t: 'Choose applicant', d: 'Apply for yourself or family — each with their own PAN, demat & UPI.' },
          { t: 'Confirm & consent', d: 'Set lots and price; give explicit, itemized consent at apply time.' },
          { t: 'Approve UPI mandate', d: 'Funds are blocked via ASBA — never debited until shares are allotted.' },
        ].map((s, i) => (
          <div className="stepcard" key={s.t}>
            <span className="sn">{i + 1}</span>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </div>
        ))}
      </div>

      {/* ---------- FEATURES ---------- */}
      <div className="section-head"><h2>Built for Indian investors</h2></div>
      <div className="feature-grid">
        {[
          { ic: 'users' as const, t: 'Family applications', d: 'One account, every family member — fully compliant with the self-PAN rule.' },
          { ic: 'trending' as const, t: 'Live data', d: 'Real-time subscription by category, price band, lot size and grey-market sentiment.' },
          { ic: 'shield' as const, t: 'ASBA-safe', d: 'Funds blocked, not debited. UPI mandate approved by each applicant.' },
          { ic: 'globe' as const, t: 'In your language', d: 'English & Hindi today, with more Indian languages on the way.' },
        ].map((f) => (
          <div className="feature" key={f.t}>
            <span className="ic"><Icon name={f.ic} size={22} /></span>
            <h3>{f.t}</h3>
            <p>{f.d}</p>
          </div>
        ))}
      </div>
    </>
  );
}

