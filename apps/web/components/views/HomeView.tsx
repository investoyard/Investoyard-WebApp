import { getIpos, getPosts } from '@/lib/api';
import { HomeNews } from '@/components/HomeNews';
import { IpoExplorer } from '@/components/IpoExplorer';
import { IpoExplorer2 } from '@/components/IpoExplorer2';
import { HeroBanner } from '@/components/HeroBanner';
import { BrokerHero } from '@/components/BrokerHero';
import { ThemeIpoSection } from '@/components/ThemeIpoSection';
import { OnyxDesk } from '@/components/OnyxDesk';
import { FeaturedIpoModal } from '@/components/FeaturedIpoModal';
import { TodayStrip } from '@/components/TodayStrip';
import { GmpAccuracy } from '@/components/GmpAccuracy';
import { AllotmentChecker } from '@/components/AllotmentChecker';
import { WhatsAppCta } from '@/components/WhatsAppCta';
import { RmCard } from '@/components/RmCard';
import { AppBand } from '@/components/AppBand';
import { Icon } from '@/components/Icon';
import { Lang } from '@investoyard/i18n';

/**
 * Locale-parameterized home view — rendered at `/` (en) and `/[lang]/` (SEO routes).
 *
 * ONE DOM FOR EVERY TEMPLATE, ARRANGED BY CSS. A static export answers every
 * host with one set of HTML, so the layout cannot be branched at build time —
 * which leaves two options: put every layout's DOM in the page and let CSS pick,
 * or render the chosen one in the browser. The second costs what the static
 * export buys, so every section is here, once, wearing a `data-sec` name, and
 * each template's block in globals.css gives it an `order` and decides whether
 * it shows. The arrangement is then READABLE IN ONE PLACE per template instead
 * of being spread through conditionals here.
 *
 * `.tpl-flow` exists only to be the flex parent `order` needs. It is NOT
 * `main.container`: making that flex would reach every page on the site, and
 * block children in a flex column do not collapse margins the way they do now.
 *
 * THE EMPTY-WRAPPER TRAP. Several of these render nothing — `GmpAccuracy` when
 * the tenant has GMP off, `HomeNews` until something is published, `WhatsAppCta`
 * until a channel is configured, and all three new broker blocks on our own
 * channel. In a flex column with `gap`, a wrapper around nothing is still a
 * flex item and still takes a gap, so the page would grow holes. `.tpl-flow >
 * :empty { display: none }` in globals.css is what closes them.
 */
export async function HomeView({ lang, v2 = false }: { lang: Lang; v2?: boolean }) {
  const ipos = await getIpos();
  const posts = await getPosts(3);
  const q = lang === 'en' ? '' : `?lang=${lang}`; // app-page links keep the query form

  return (
    <>
      {/* ---------- featured-issue welcome panel ----------
           Renders nothing unless the featured symbol is in the live list and
           still open; see FeaturedIpoModal for the gate it reads. Outside the
           flow: it is an overlay, not a section, and ordering it is meaningless. */}
      <FeaturedIpoModal ipos={ipos as any} />

      <div className="tpl-flow">
        {/* ---------- the broker templates' hero ----------
             A headline that stays still, for a broker introducing themselves.
             Hidden on our own layout, where HeroBanner is the hero. */}
        <div className="tpl-sec" data-sec="brokerhero"><BrokerHero ipos={ipos as any} langQuery={q} /></div>

        {/* ---------- compact dynamic banner (auto IPO slides + brand slide) ---------- */}
        <div className="tpl-sec" data-sec="hero"><HeroBanner ipos={ipos as any} lang={lang} /></div>

        {/* ---------- today strip: the market's pulse in one line ----------
             v2 folds these counts into the explorer's market bar, so the
             standalone strip would repeat them. */}
        {!v2 && <div className="tpl-sec" data-sec="today"><TodayStrip ipos={ipos as any} langQuery={q} /></div>}

        {/* ---------- IPO EXPLORER ----------
             NO `id` HERE. `IpoExplorer2` already renders `<section id="ipos">`,
             which is what the broker hero's CTA targets — putting the same id
             on this wrapper made two of them, and the first one wins: on our
             own layout that is this wrapper, which computes `display: contents`
             and therefore generates no box to scroll to. */}
        {/* ONYX PRESENTS THE CATALOGUE AS A DESK BLOTTER, not a card grid,
            and it is its own markup because the view cannot be chosen at
            build time: a static export answers every host with one set of
            HTML, so CSS decides which of these two sections is shown. */}
        <div className="tpl-sec" data-sec="desk"><OnyxDesk ipos={ipos as any} langQuery={q} /></div>

        <div className="tpl-sec" data-sec="explorer">
          {/* THE EXPLORER IS PASSED IN AS CHILDREN, so it mounts once. A theme
              wraps it with the design's three-view switch (IPO Calendar /
              Allotment / Live subscription); on our own layout that switch is
              hidden by CSS and the default view is the calendar, so this
              renders exactly what it rendered before the wrapper existed. */}
          <ThemeIpoSection ipos={ipos as any} lang={lang}>
            {v2 ? <IpoExplorer2 ipos={ipos} lang={lang} /> : <IpoExplorer ipos={ipos} lang={lang} />}
          </ThemeIpoSection>
        </div>

        {/* ---------- allotment checker: did you get the shares? ---------- */}
        <div className="tpl-sec" data-sec="allotment">
          <div className="panel ac-band fade-up">
            <AllotmentChecker ipos={ipos as any} compact />
          </div>
        </div>

        {/* ---------- GMP accuracy: final GMP vs actual listing gain ----------
             Already silent for a white-label: `registerTenant` sets
             gmpEnabled:false and LOCKS it, and GmpAccuracy reads that flag. So
             Sir's "GMP stays off" on the broker templates needs no rule here —
             it is the tenant's flag, not the layout's, which is right: a
             template must not override an operator's decision. */}
        <div className="tpl-sec" data-sec="gmp"><GmpAccuracy ipos={ipos as any} /></div>

        {/* ---------- the broker's relationship manager ---------- */}
        <div className="tpl-sec" data-sec="rm"><RmCard /></div>

        {/* ---------- latest news (hidden until something is published) ---------- */}
        <div className="tpl-sec" data-sec="news"><HomeNews posts={posts} /></div>

        {/* ---------- WhatsApp updates (renders once the channel URL is configured) ---------- */}
        <div className="tpl-sec" data-sec="whatsapp"><WhatsAppCta /></div>

        {/* ---------- HOW IT WORKS ---------- */}
        <div className="tpl-sec" data-sec="steps">
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
        </div>

        {/* ---------- FEATURES ---------- */}
        <div className="tpl-sec" data-sec="features">
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
        </div>

        {/* ---------- the broker's own app ---------- */}
        <div className="tpl-sec" data-sec="app"><AppBand /></div>
      </div>
    </>
  );
}
