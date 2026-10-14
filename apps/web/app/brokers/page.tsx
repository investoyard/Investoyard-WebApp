import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import '../platform/platform.css';
import './brokers.css';
import {
  APPLY, CLIENT, CLOSE, DISCLAIMER, DOC, Feature, GLANCE,
  HERO_LINE, MODELS, REQUIREMENTS, SEBI, SEBI_NOTE, SECTIONS, WHY,
} from './content';

/**
 * /brokers — the capability document for SEBI-registered stock brokers.
 *
 * v3.0 — COMPACT, four pages, one tile system throughout. Sir asked for short,
 * key points only, tiles, and plain Indian English. See content.ts for the full
 * diagnosis of what was removed and why each removal is a correction rather
 * than a trim. The structural consequences here:
 *
 *  - ONE TILE COMPONENT RENDERS EVERY SECTION. v2.0 had five different
 *    treatments — feature cards, a ten-row tier table, a boxed callout, a
 *    three-column tick list and a numbered vertical flow. A reader meets a new
 *    layout on every page and has to learn it before reading it. Now the grid
 *    only changes WIDTH (4-up, 3-up, 2-up) and the eye carries across.
 *
 *  - SECTION 04 IS GONE ENTIRELY, with the ten-row table, its callout and the
 *    four-item check list. The two rows that were real restrictions moved into
 *    section 05, where a compliance officer looks for them anyway.
 *
 *  - THE "HOW IT RUNS" NUMBERED FLOW IS GONE. It cost most of a page to say
 *    what the close already says in two sentences, and it was the step list
 *    that had to be kept together with break-inside in v2.0 — removing it
 *    removes that whole class of page-break fault.
 *
 *  - SECTION 05 IS THE REASON THE DOCUMENT GETS FORWARDED. Nine SEBI rules the
 *    product enforces, each carrying its figure, plus the one sentence that
 *    stops the page reading as a regulatory clearance.
 *
 * Shares /platform's stylesheet so the two documents cannot drift; only what
 * is unique to this reader lives in brokers.css.
 *
 * Unlisted (`noindex`, nothing links to it) and zero client JavaScript.
 */
export const metadata: Metadata = {
  title: 'For stock brokers — Investoyard',
  description:
    'The Investoyard IPO platform for SEBI-registered stock brokers: why partner with us, white-label and API integration, how your clients apply, the SEBI rules the product enforces, and what onboarding needs from you.',
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

/**
 * THE one tile. Every section is a grid of these and nothing else, so the
 * reader learns the shape once on page 2 and never re-learns it.
 * `cols` changes the width of the grid, never the anatomy of the tile.
 */
function Tiles({ items, cols = 3 }: { items: readonly Feature[]; cols?: 2 | 3 | 4 }) {
  return (
    <div className={`brk-tiles brk-tiles-${cols}`}>
      {items.map((x) => (
        <div key={x.t} className="brk-tile">
          <span className="plt-ic"><Icon name={x.icon as never} size={16} /></span>
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

      {/* ── page 2 ─────────────────────────────────────────────────────── */}
      {/* The business case leads. A broker is not buying a feature list. */}
      <section id="why" className="plt-sec brk-page-start">
        <Opener id="why" />
        <Tiles items={WHY} cols={2} />
      </section>

      <section id="client" className="plt-sec">
        <Opener id="client" />
        <Tiles items={CLIENT} cols={2} />
      </section>

      {/* ── page 3 ─────────────────────────────────────────────────────── */}
      <section id="models" className="plt-sec brk-page-start">
        <Opener id="models" />
        {/* The one place a tile carries a number instead of an icon: these are
            three CHOICES, and numbering them is what says "pick one". */}
        <div className="brk-tiles brk-tiles-3">
          {MODELS.map((m) => (
            <div key={m.n} className="brk-tile brk-tile-n">
              <span className="brk-n">{m.n}</span>
              <div className="brk-k">{m.k}</div>
              <b>{m.t}</b>
              <p>{m.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="apply" className="plt-sec">
        <Opener id="apply" />
        <Tiles items={APPLY} cols={3} />
      </section>

      {/* Page 3 closes on the checklist. It was on page 4 and pushed the
          footer onto a FIFTH page carrying nothing but the disclaimer — the
          "ends on half a page of white space" fault v2.0 was rebuilt to fix,
          wearing different clothes. Pages 2 and 3 had the room. */}
      <section id="onboard" className="plt-sec">
        <Opener id="onboard" />
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
      </section>

      {/* ── page 4 ─────────────────────────────────────────────────────── */}
      <section id="sebi" className="plt-sec brk-page-start">
        <Opener id="sebi" />
        <Tiles items={SEBI} cols={3} />
        <p className="brk-note-line">
          <Icon name="shield" size={14} />
          <span>{SEBI_NOTE}</span>
        </p>
      </section>

      {/* A document a broker is meant to act on closes on an invitation. */}
      <section className="brk-close">
        <div>
          <h2>{CLOSE.title}</h2>
          <p>{CLOSE.body}</p>
        </div>
        <div className="brk-close-cta">
          <span className="brk-close-label">{CLOSE.label}</span>
          <span className="brk-close-url">{CLOSE.url}</span>
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
