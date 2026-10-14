import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import '../platform/platform.css';
import './brokers.css';
import {
  APPLY, CHECKS, CLIENT, CLOSE, DATA, DESK, DISCLAIMER, DOC, Feature, GLANCE,
  GOVERNANCE, HERO_LINE, MODELS, REQUIREMENTS, SECTIONS, STEPS, WHY,
} from './content';

/**
 * /brokers — the capability document for SEBI-registered stock brokers.
 *
 * v2.0, rebuilt after sir rejected v1.0 on branding, on having nothing to
 * attract a broker, and on never saying what onboarding requires. See the
 * header of content.ts for the full diagnosis; the structural consequences
 * here are:
 *
 *  - THE REAL LOGO, inside a white panel on the dark cover. v1.0 drew a gold
 *    square plus letterspaced text while investoyard-logo.svg sat unused. The
 *    panel is what lets the actual asset appear in its true indigo-and-gold
 *    rather than being recoloured into a second file that would drift.
 *  - SECTION 01 IS THE BUSINESS CASE, before anything technical. A broker is
 *    not buying features, and v1.0 opened with integration models.
 *  - SECTION 08 IS WHAT THEY BRING. A broker reading this is deciding whether
 *    to forward it to compliance, which they cannot do without the list.
 *  - IT CLOSES ON AN INVITATION. v1.0 ended on a legal paragraph and half a
 *    page of white space, which is the worst possible last impression.
 *
 * Shares /platform's stylesheet so the two documents cannot drift; only what
 * is unique to this reader lives in brokers.css.
 *
 * Unlisted (`noindex`, nothing links to it) and zero client JavaScript.
 */
export const metadata: Metadata = {
  title: 'For stock brokers — Investoyard',
  description:
    'The Investoyard IPO platform for SEBI-registered stock brokers: why partner with us, white-label and API integration, which data you can display, compliance posture, and exactly what onboarding requires.',
  robots: { index: false, follow: false },
};

/** The real mark. `dark` puts it on a white panel so it keeps its own colours. */
const Logo = ({ dark = false, h = 26 }: { dark?: boolean; h?: number }) =>
  dark ? (
    <span className="brk-logo-panel">
      <img src="/investoyard-logo.svg" alt="Investoyard" style={{ height: h, width: 'auto', display: 'block' }} />
    </span>
  ) : (
    <img src="/investoyard-logo.svg" alt="Investoyard" style={{ height: h, width: 'auto', display: 'block' }} />
  );

function Grid({ items, cols = 2 }: { items: readonly Feature[]; cols?: 2 | 3 }) {
  return (
    <div className={`plt-grid${cols === 3 ? ' plt-grid-3' : ''}`}>
      {items.map((x) => (
        <div key={x.t} className="plt-card">
          <span className="plt-ic"><Icon name={x.icon as never} size={17} /></span>
          <b>{x.t}</b>
          <p>{x.d}</p>
        </div>
      ))}
    </div>
  );
}

function Opener({ id }: { id: string }) {
  const s = SECTIONS.find((x) => x.id === id)!;
  return (
    <div className="plt-open">
      <div className="plt-open-n">{s.n}</div>
      <div><h2>{s.t}</h2></div>
    </div>
  );
}

const TIER = {
  open: { label: 'On by default', cls: 'brk-t-open' },
  optin: { label: 'Opt-in per account', cls: 'brk-t-optin' },
  locked: { label: 'Off and locked', cls: 'brk-t-locked' },
  never: { label: 'Never shared', cls: 'brk-t-never' },
} as const;

export default function BrokersPage() {
  return (
    <div className="plt brk">
      <div className="plt-cover" aria-hidden="true">
        <svg className="plt-cover-art" viewBox="0 0 420 120" preserveAspectRatio="none" aria-hidden="true">
          {[
            [10, 34, 62, 18, 86], [46, 50, 78, 32, 96], [82, 22, 54, 10, 72],
            [118, 44, 88, 28, 104], [154, 30, 58, 16, 78], [190, 56, 96, 40, 110],
            [226, 26, 66, 14, 84], [262, 48, 82, 34, 98], [298, 36, 70, 22, 90],
            [334, 54, 100, 42, 114], [370, 28, 60, 12, 80],
          ].map(([x, top, bot, wTop, wBot], i) => (
            <g key={i} className={i % 3 === 0 ? 'plt-c-gold' : 'plt-c-pale'}>
              <line x1={x + 9} y1={wTop} x2={x + 9} y2={wBot} strokeWidth="1.5" />
              <rect x={x} y={top} width="18" height={bot - top} rx="2" />
            </g>
          ))}
        </svg>

        <Logo dark h={30} />

        <div className="plt-cover-mid">
          <div className="plt-cover-kicker">{DOC.kicker}</div>
          <h1>{DOC.title}</h1>
          <span className="plt-cover-rule" />
          <p>{HERO_LINE}</p>
        </div>

        <div className="plt-cover-stats">
          {GLANCE.map((g) => (
            <div key={g.l}>
              <div className="plt-cover-stat-v">{g.v}</div>
              <div className="plt-cover-stat-l">{g.l}</div>
            </div>
          ))}
        </div>

        <div className="plt-cover-foot">
          <span>{DOC.entity}</span>
          <span>{DOC.version} · {DOC.updated} · {DOC.site}</span>
        </div>
      </div>

      <header className="plt-hero">
        <Logo dark h={28} />
        <div className="plt-hero-kicker">{DOC.kicker}</div>
        <h1>{DOC.title}</h1>
        <p className="plt-hero-lede">{HERO_LINE}</p>
        <div className="plt-actions">
          <a className="plt-btn plt-btn-gold" href="/Investoyard-For-Brokers.pdf" download>
            <Icon name="download" size={15} /> Download as PDF
          </a>
          <Link className="plt-btn plt-btn-ghost" href="/partner/apply">
            Apply to partner <Icon name="arrow-right" size={15} />
          </Link>
        </div>
      </header>

      <section className="plt-band">
        {GLANCE.map((g) => (
          <div key={g.l} className="plt-tile">
            <div className="plt-tile-v">{g.v}</div>
            <div className="plt-tile-l">{g.l}</div>
            <div className="plt-tile-s">{g.s}</div>
          </div>
        ))}
      </section>

      {/* 01 — the business case leads. */}
      <section id="why" className="plt-sec">
        <Opener id="why" />
        <p className="plt-body plt-body-lead">
          You already have the clients and the licence. What you probably do not have is an IPO desk
          that keeps them in your app for the one week a year they are most tempted to look elsewhere.
        </p>
        <Grid items={WHY} />
      </section>

      <section id="models" className="plt-sec">
        <Opener id="models" />
        <ol className="plt-stack">
          {MODELS.map((m) => (
            <li key={m.n}>
              <span className="plt-stack-n">{m.n}</span>
              <div className="plt-stack-k">{m.k}</div>
              <div className="plt-stack-t">{m.t}</div>
              <div className="plt-stack-d">{m.d}</div>
            </li>
          ))}
        </ol>
      </section>

      <section id="client" className="plt-sec">
        <Opener id="client" />
        <p className="plt-body plt-body-lead">
          The research surface is the retention argument. A client who leaves your app to check
          subscription is a client in someone else&rsquo;s funnel.
        </p>
        <Grid items={CLIENT} />
      </section>

      <section id="data" className="plt-sec">
        <Opener id="data" />
        <p className="plt-body plt-body-lead">
          Every data surface is controlled per account. Some are on from day one, some are granted
          deliberately, and one is locked off on every white-label and cannot be self-enabled.
        </p>

        <div className="brk-data">
          {DATA.map((d) => (
            <div key={d.t} className="brk-row">
              <div className="brk-row-head">
                <b>{d.t}</b>
                <span className={`brk-tier ${TIER[d.tier as keyof typeof TIER].cls}`}>
                  {TIER[d.tier as keyof typeof TIER].label}
                </span>
              </div>
              <p>{d.d}</p>
              <p className="brk-note">{d.note}</p>
            </div>
          ))}
        </div>

        <div className="brk-callout">
          <div className="brk-callout-h">
            <Icon name="shield" size={16} />
            <b>Where our responsibility ends and yours begins</b>
          </div>
          <p>
            The controls above are ours, and we will configure and lock them to whatever you decide.
            Whether your registration permits publishing a particular figure is your compliance
            function&rsquo;s determination, not ours — this document is not legal advice. Four things
            worth settling before you go live:
          </p>
          <ol className="brk-checks">{CHECKS.map((c) => <li key={c}>{c}</li>)}</ol>
        </div>
      </section>

      <section id="apply" className="plt-sec">
        <Opener id="apply" />
        <Grid items={APPLY} />
      </section>

      <section id="governance" className="plt-sec plt-dark">
        <Opener id="governance" />
        <Grid items={GOVERNANCE} cols={3} />
      </section>

      <section id="desk" className="plt-sec">
        <Opener id="desk" />
        <Grid items={DESK} cols={3} />
      </section>

      {/* 08 — what they bring, and how it runs. The section sir asked for. */}
      <section id="onboard" className="plt-sec">
        <Opener id="onboard" />
        <p className="plt-body plt-body-lead">
          Nothing here is unusual for a registered intermediary — but it is worth having to hand
          before you start, because the application asks for all of it.
        </p>

        <div className="brk-req">
          {REQUIREMENTS.map((g) => (
            <div key={g.k} className="brk-req-col">
              <div className="brk-req-k">{g.k}</div>
              <ul>
                {g.items.map((i) => (
                  <li key={i}><span className="brk-tick"><Icon name="check" size={11} /></span>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <h3 className="plt-h3" style={{ marginTop: 26 }}>How it runs</h3>
        <ol className="brk-flow">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="brk-flow-n">{s.n}</span>
              <div><b>{s.t}</b><p>{s.d}</p></div>
            </li>
          ))}
        </ol>
      </section>

      {/* A document a broker is meant to act on closes on an invitation, not a
          disclaimer. v1.0 ended on the legal paragraph and empty space. */}
      <section className="brk-close">
        <div>
          <h2>{CLOSE.title}</h2>
          <p>{CLOSE.body}</p>
        </div>
        <div className="brk-close-cta">
          <span className="brk-close-label">Apply online</span>
          <span className="brk-close-url">{CLOSE.cta}</span>
        </div>
      </section>

      <footer className="plt-foot">
        <Logo h={24} />
        <p style={{ marginTop: 12 }}>{DISCLAIMER}</p>
        <p className="plt-foot-meta">For stock brokers · {DOC.version} · {DOC.updated} · {DOC.site}</p>
      </footer>
    </div>
  );
}
