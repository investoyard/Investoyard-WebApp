import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import './platform.css';
import {
  APPLY, COMPLIANCE, CONSOLE, DISCLAIMER, DOC, ENGINE, Feature, GLANCE, HERO_LINE,
  LAYERS, PARTNER, RESEARCH, SNAPSHOT, STEPS, WHY,
} from './content';

/**
 * /platform — the capability document we send a partner BEFORE they apply.
 *
 * It fills the gap between the two partner surfaces that already exist:
 * `/partner` is an 82-line conversion landing that funnels to Apply, and
 * `/partner-api` is the technical reference for partners who have already
 * signed. Neither answers "what is this platform and why would I trust it".
 *
 * WHY THE LAYOUT VARIES SECTION BY SECTION. The first version rendered every
 * section as the same bordered two-column card grid and read as documentation
 * rather than a sales document — the operator's verdict was "ordinary", and it
 * was right. Twenty-four identical cards have no hierarchy, so nothing is
 * emphasised and the eye has nowhere to land. Now: a gradient cover, a stat
 * band, an architecture spine, a REAL data panel, a dark section for the
 * engine, a tinted compliance checklist and a gradient close. Variety is the
 * hierarchy.
 *
 * THE DESIGN LANGUAGE IS THE BRAND'S OWN MARKETING ONE, not the app's — see
 * D:\Investoyard-Social. Those comps use a lavender ground, an indigo gradient,
 * gold as a primary (it is the most-used colour across them), 72-88px Jakarta
 * display type and elevated cards at 24px radius. The app's dense utility
 * register is right for a subscription table and wrong for this.
 *
 * UNLISTED, NOT ACCESS-CONTROLLED. `noindex` keeps it out of search and nothing
 * links to it, but anyone holding the link can open it — the right trade for a
 * document whose job is to be forwarded. Nothing confidential goes here.
 *
 * ZERO CLIENT JAVASCRIPT. Figures are baked and dated rather than fetched:
 * `/ipos` is a ~1.2 MB response and catalogue counts rot within hours, so a
 * dated figure is both cheaper and more honest than a live one that may be a
 * day stale by the time it prints.
 *
 * NO `scroll-margin-top` ON SECTIONS — `html` already carries
 * `scroll-padding-top: calc(var(--header-h) + 72px)` and the two ADD.
 */
export const metadata: Metadata = {
  title: 'Platform overview — Investoyard',
  description:
    'What the Investoyard IPO platform does, for distribution partners: live subscription across both exchanges, applications and print forms, the Partner API, the operator console, and the data engine underneath.',
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

function Opener({ n, k, t, d }: { n: string; k: string; t: string; d: string }) {
  return (
    <div className="plt-open">
      <div className="plt-open-n">{n}</div>
      <div>
        <div className="plt-eyebrow">{k}</div>
        <h2>{t}</h2>
        <p>{d}</p>
      </div>
    </div>
  );
}

/** The real snapshot. Showing the product beats describing it. */
function Snapshot() {
  return (
    <figure className="plt-snap">
      <figcaption className="plt-snap-head">
        <div>
          <div className="plt-snap-name">{SNAPSHOT.name}</div>
          <div className="plt-snap-meta">{SNAPSHOT.meta}</div>
        </div>
        <span className="plt-live">Live</span>
      </figcaption>
      <table className="plt-snap-tbl">
        <thead>
          <tr><th>Category</th><th>Subscribed</th><th>Applications</th></tr>
        </thead>
        <tbody>
          {SNAPSHOT.rows.map((r) => (
            <tr key={r.c}>
              <td>{r.c}</td>
              <td><span className={`plt-x plt-x-${r.tone}`}>{r.x}×</span></td>
              <td>{r.apps}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>{SNAPSHOT.total.c}</td>
            <td><b>{SNAPSHOT.total.x}×</b></td>
            <td><b>{SNAPSHOT.total.apps}</b></td>
          </tr>
        </tfoot>
      </table>
      <div className="plt-snap-foot">
        Both exchanges, reconciled · as at {SNAPSHOT.asAt}
      </div>
    </figure>
  );
}

export default function PlatformPage() {
  return (
    <div className="plt">
      {/* Print-only cover. On screen the gradient hero does this job in a shape
          that suits scrolling rather than a sheet of A4. */}
      <div className="plt-cover" aria-hidden="true">
        {/* The candlestick motif is the brand's own — it backs the site banner
            and is the shape inside the app icon. It earns its place by being
            the one graphic that says "markets" without a stock photograph, and
            it fills the upper third that was otherwise dead space. */}
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

        {/* The glance figures live on the cover rather than on page two. They
            fill the lower third, they make the cover informative instead of
            decorative, and a reader who opens the PDF and reads nothing else
            still leaves with the four numbers that matter. */}
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
          <a className="plt-btn plt-btn-gold" href="/Investoyard-Platform-Overview.pdf" download>
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

      <section className="plt-sec">
        <div className="plt-eyebrow">The platform</div>
        <h2 className="plt-h2">Five layers. You choose where to plug in.</h2>
        <p className="plt-body plt-body-lead">
          Most partners take the whole stack under their own brand. Some keep the front end they already
          have and use one endpoint. Both are first-class, and you can move between them without
          rebuilding.
        </p>
        <ol className="plt-stack">
          {LAYERS.map((l) => (
            <li key={l.id}>
              <span className="plt-stack-n">{l.n}</span>
              <div className="plt-stack-k">{l.k}</div>
              <div className="plt-stack-t">{l.t}</div>
              <div className="plt-stack-d">{l.d}</div>
            </li>
          ))}
        </ol>
      </section>

      <section id="research" className="plt-sec plt-break">
        <Opener n="01" k={LAYERS[0].k} t={LAYERS[0].t} d={LAYERS[0].d} />
        <div className="plt-split">
          <div className="plt-split-l">
            <h3 className="plt-h3">The number your client refreshes</h3>
            <p className="plt-body">
              Subscription is the figure an investor checks ten times on closing day, and the one most
              easily got wrong. We reconcile both exchanges into a single table, deduct the anchor from
              QIB so the multiple measures what is actually available, and show applications beside
              shares — because allotment odds depend on how many people applied, not how many shares
              they asked for.
            </p>
            <p className="plt-body">
              Every row cross-checks: Book Size × Times = Subscribed, recomputed locally from raw
              exchange demand rather than taken on trust.
            </p>
          </div>
          <Snapshot />
        </div>
        <Grid items={RESEARCH} />
      </section>

      <section id="apply" className="plt-sec plt-break">
        <Opener n="02" k={LAYERS[1].k} t={LAYERS[1].t} d={LAYERS[1].d} />
        <Grid items={APPLY} />
      </section>

      <section id="partner" className="plt-sec plt-break">
        <Opener n="03" k={LAYERS[2].k} t={LAYERS[2].t} d={LAYERS[2].d} />
        <Grid items={PARTNER} />
      </section>

      <section id="console" className="plt-sec plt-break">
        <Opener n="04" k={LAYERS[3].k} t={LAYERS[3].t} d={LAYERS[3].d} />
        <Grid items={CONSOLE} />
      </section>

      {/* Dark. The engine is the part nobody sees, so it gets the one section
          that looks different from everything around it. */}
      <section id="engine" className="plt-sec plt-dark plt-break">
        <Opener n="05" k={LAYERS[4].k} t={LAYERS[4].t} d={LAYERS[4].d} />
        <Grid items={ENGINE} cols={3} />
      </section>

      <section id="why" className="plt-sec plt-break">
        <div className="plt-eyebrow">Why Investoyard</div>
        <h2 className="plt-h2">IPO data is easy to display and hard to get right.</h2>
        <p className="plt-body plt-body-lead">
          Most of the engineering here has gone into the second part, because a figure a client can
          disprove against another site costs you the relationship, not us.
        </p>
        <Grid items={WHY} />
      </section>

      <section id="compliance" className="plt-sec plt-tint plt-break">
        <div className="plt-eyebrow">Compliance, security and privacy</div>
        <h2 className="plt-h2">Built into the product, not kept beside it.</h2>
        <p className="plt-body plt-body-lead">
          The rules below are enforced in code, on every application and every issue.
        </p>
        <div className="plt-checks">
          {COMPLIANCE.map((c) => (
            <div key={c.t} className="plt-check">
              <span className="plt-check-ic"><Icon name="check" size={13} /></span>
              <div><b>{c.t}</b><p>{c.d}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section id="start" className="plt-sec plt-break">
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
        <div className="plt-cta">
          <div>
            <h3>Applying costs nothing and commits you to nothing.</h3>
            <p>We will tell you honestly whether the fit works.</p>
          </div>
          <Link className="plt-btn plt-btn-gold" href="/partner/apply">
            Start your application <Icon name="arrow-right" size={15} />
          </Link>
        </div>
      </section>

      <footer className="plt-foot">
        <Mark />
        <p>{DISCLAIMER}</p>
        <p className="plt-foot-meta">Platform overview · {DOC.version} · {DOC.updated} · {DOC.site}</p>
      </footer>
    </div>
  );
}
