import { getIpos } from '@/lib/api';
import { IpoExplorer } from '@/components/IpoExplorer';
import { CompanyMark } from '@/components/CompanyMark';
import { Icon } from '@/components/Icon';
import { priceBand } from '@/lib/format';
import { makeT, Lang } from '@investoyard/i18n';

/** Locale-parameterized home view — rendered at `/` (en) and `/[lang]/` (SEO routes). */
export async function HomeView({ lang }: { lang: Lang }) {
  const tr = makeT(lang);
  const ipos = await getIpos();
  const q = lang === 'en' ? '' : `?lang=${lang}`; // app-page links keep the query form

  const open = ipos.filter((i) => i.status === 'open');
  const upcoming = ipos.filter((i) => i.status === 'upcoming');
  const feature = open[0] ?? ipos[0];

  return (
    <>
      {/* ---------- HERO ---------- */}
      <section className="hero fade-up">
        <div>
          <span className="eyebrow"><Icon name="sparkle" size={14} /> Mainboard &amp; SME · India</span>
          <h1 className="display" style={{ marginTop: 16 }}>
            Investing in IPOs,<br />has never been <span className="gold-word">this easy</span>.
          </h1>
          <p className="lead">{tr('home.subtitle')}</p>

          <div className="hero-cta">
            <a className="btn btn-lg btn-white" href="#ipos">Explore open IPOs <Icon name="arrow-right" size={18} /></a>
            <a className="btn btn-lg btn-ondark" href={`/login${q}`}>Apply for self &amp; family</a>
          </div>

          <div className="hero-trust">
            <div><div className="n mono">{open.length}</div><div className="l">Open now</div></div>
            <div><div className="n mono">{upcoming.length}</div><div className="l">Upcoming</div></div>
            <div><div className="n mono">100%</div><div className="l">UPI · ASBA</div></div>
          </div>

          <div className="hero-rails">
            <Icon name="shield" size={15} /> <span>Powered by merchant-banker rails — <b>NSE e-IPO</b> &amp; <b>BSE iBBS</b></span>
          </div>
        </div>

        {/* product showcase (real DOM, not an image) */}
        <div className="hero-visual" aria-hidden="true">
          <div className="showcase">
            <div className="sc-top">
              <CompanyMark name={feature.name} symbol={feature.symbol} size="md" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-display)' }}>{feature.name}</div>
                <div className="muted mono" style={{ fontSize: 13 }}>{priceBand(feature.priceBandMin, feature.priceBandMax)} · Lot {feature.lotSize ?? '—'}</div>
              </div>
              <span className="status open">open</span>
            </div>
            <div className="sc-bars">
              {[['QIB', 84], ['NII', 62], ['Retail', 48]].map(([c, w]) => (
                <div className="sc-bar" key={c as string}>
                  <span>{c}</span><span className="track"><i style={{ width: `${w}%` }} /></span>
                  <span className="mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{(Number(w) / 6.5).toFixed(1)}×</span>
                </div>
              ))}
            </div>
            <div className="sc-foot">
              <span className="muted" style={{ fontSize: 13 }}>Min ₹14,910</span>
              <span className="btn btn-sm">Apply</span>
            </div>
          </div>
          <span className="sc-chip a"><span className="gmp-pos mono">+18</span> GMP</span>
          <span className="sc-chip b"><Icon name="check" size={15} style={{ color: 'var(--pos)' }} /> Allotted</span>
        </div>
      </section>

      {/* ---------- IPO EXPLORER ---------- */}
      <IpoExplorer ipos={ipos} lang={lang} />

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

