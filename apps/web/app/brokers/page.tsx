import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import '../platform/platform.css';
import './brokers.css';
import {
  APPLY, CHECKS, CLIENT, DATA, DESK, DISCLAIMER, DOC, Feature, GLANCE,
  GOVERNANCE, HERO_LINE, MODELS, SECTIONS, STEPS,
} from './content';

/**
 * /brokers — the capability document for SEBI-registered stock brokers.
 *
 * Shares /platform's visual system by importing its stylesheet, so the two
 * documents cannot drift. Only the pieces unique to this reader live in
 * brokers.css — chiefly the data table, which is the section the whole
 * document exists for.
 *
 * ORDER OF ARGUMENT IS DELIBERATELY DIFFERENT from /platform. A broker already
 * has clients, a brand and a compliance function, so what they buy is a desk
 * under their own name, not a distribution channel. White-label and data
 * governance lead; the research surface follows as a RETENTION argument; there
 * is no commercial talk at all.
 *
 * SECTION 02 STATES WHAT THE PLATFORM DOES, NOT WHAT THE LAW ALLOWS. Which
 * feeds are open, opt-in, locked or never shared is a fact about our product
 * and we can assert it. Whether a given firm may publish a given figure is
 * their compliance function's determination, and the page says so plainly
 * rather than implying a clearance we are in no position to give.
 *
 * Unlisted (`noindex`, nothing links to it) and zero client JavaScript, for
 * the same reasons as /platform.
 */
export const metadata: Metadata = {
  title: 'For stock brokers — Investoyard',
  description:
    'The Investoyard IPO platform for SEBI-registered stock brokers: white-label and API integration, which data you can display, client experience, applications, and data governance.',
  robots: { index: false, follow: false },
};

const Mark = () => (
  <div className="plt-mark">
    <span className="plt-mark-sq" />
    <span className="plt-mark-w">Investoyard</span>
  </div>
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
        <Mark />
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
        <Mark />
        <div className="plt-hero-kicker">{DOC.kicker}</div>
        <h1>{DOC.title}</h1>
        <p className="plt-hero-lede">{HERO_LINE}</p>
        <div className="plt-actions">
          <a className="plt-btn plt-btn-gold" href="/Investoyard-For-Brokers.pdf" download>
            <Icon name="download" size={15} /> Download as PDF
          </a>
          <Link className="plt-btn plt-btn-ghost" href="/partner-api">
            Read the API reference <Icon name="arrow-right" size={15} />
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

        {/* The honest boundary. Stating what the platform enforces is ours to
            state; stating what a registered firm may publish is not. */}
        <div className="brk-callout">
          <div className="brk-callout-h">
            <Icon name="shield" size={16} />
            <b>Where our responsibility ends and yours begins</b>
          </div>
          <p>
            The controls above are ours and we will configure and lock them to whatever you decide.
            Whether your registration permits publishing a particular figure is your compliance
            function’s determination, not ours — this document is not legal advice. Four things worth
            settling before you go live:
          </p>
          <ol className="brk-checks">
            {CHECKS.map((c) => <li key={c}>{c}</li>)}
          </ol>
        </div>
      </section>

      <section id="client" className="plt-sec">
        <Opener id="client" />
        <p className="plt-body plt-body-lead">
          The research surface is a retention argument. A client who leaves your app to check
          subscription somewhere else is a client in someone else’s funnel.
        </p>
        <Grid items={CLIENT} />
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

      <section className="plt-sec plt-tint">
        <div className="plt-eyebrow">Getting started</div>
        <h2 className="plt-h2">Four steps, and nothing to build.</h2>
        <ol className="plt-steps">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="plt-step-n">{s.n}</span>
              <div><b>{s.t}</b><p>{s.d}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="plt-foot">
        <Mark />
        <p>{DISCLAIMER}</p>
        <p className="plt-foot-meta">For stock brokers · {DOC.version} · {DOC.updated} · {DOC.site}</p>
      </footer>
    </div>
  );
}
