import Link from 'next/link';
import { cleanRichKeepLinks, GLOSSARY } from '@investoyard/shared-types';
import type { RawPost } from './data.server';
import { FAQ_GROUPS } from './faqs';
import { dayMonYear } from './format';
import type { PerfRow } from './models';
import type { DesignUi } from './variant';
import './content.css';

/*
 * THE BODIES OF THE CONTENT PAGES every design carries at investoyard.com's
 * own addresses: FAQs, glossary, news and listing performance. (GMP and
 * contact depend on the partner and live in content-client.tsx.)
 *
 * A design supplies the FRAME (its header, hero and card, through
 * InfoPage) and its table classes (DesignUi); these supply what the page SAYS,
 * once, so five designs cannot disagree about a definition or a figure.
 * Styling reads the tokens every design declares, so each body takes on the
 * design's own type and colour.
 */

/* ------------------------------------------------------------------ FAQs */
export function FaqBody() {
  return (
    <div className="pw-faq">
      <nav className="pw-jump" aria-label="FAQ sections">
        {FAQ_GROUPS.map((g) => <a key={g.id} href={`#${g.id}`}>{g.title}</a>)}
      </nav>
      {FAQ_GROUPS.map((g) => (
        <section key={g.id} id={g.id} className="pw-faq-group" aria-labelledby={`${g.id}-h`}>
          <h2 id={`${g.id}-h`}>{g.title}</h2>
          {g.items.map((it) => (
            <details key={it.q} className="pw-faq-item">
              <summary>{it.q}</summary>
              <p>{it.a}</p>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- glossary */
export function GlossaryBody() {
  return (
    <div className="pw-gloss">
      <nav className="pw-jump" aria-label="Glossary sections">
        {GLOSSARY.map((g) => <a key={g.id} href={`#${g.id}`}>{g.title}</a>)}
      </nav>
      {GLOSSARY.map((g) => (
        <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`}>
          <h2 id={`${g.id}-h`}>{g.title}</h2>
          <dl>
            {g.terms.map(([term, def]) => (
              <div key={term} className="pw-gloss-row"><dt>{term}</dt><dd>{def}</dd></div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ news */
export function NewsListBody({ posts }: { posts: RawPost[] }) {
  if (!posts.length) {
    return <p className="pw-empty">No news has been published yet. Check back soon.</p>;
  }
  return (
    <ul className="pw-news">
      {posts.map((p) => (
        <li key={p.slug}>
          <Link href={`/news/${p.slug}/`} className="pw-news-card">
            {p.coverUrl ? <img src={p.coverUrl} alt="" loading="lazy" /> : null}
            <span className="pw-news-meta">{[dayMonYear(p.publishedAt ? p.publishedAt.slice(0, 10) : ''), p.ipoSymbol].filter(Boolean).join(' · ')}</span>
            <strong>{p.title}</strong>
            {p.excerpt ? <span className="pw-news-ex">{p.excerpt}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function NewsArticleBody({ post }: { post: RawPost | null }) {
  if (!post || !post.body) {
    return (
      <div className="pw-legal">
        <p className="pw-legal-note">This article is not available. <Link href="/news/">See all news</Link>.</p>
      </div>
    );
  }
  const date = dayMonYear(post.publishedAt ? post.publishedAt.slice(0, 10) : '');
  return (
    <article>
      <p className="pw-news-meta">{[date, post.author].filter(Boolean).join(' · ')}</p>
      {post.coverUrl ? <img className="pw-news-cover" src={post.coverUrl} alt="" /> : null}
      {/* Written in admin and sanitised on read, links kept — the same rule as the legal pages. */}
      <div className="pw-legal pw-legal-prose" dangerouslySetInnerHTML={{ __html: cleanRichKeepLinks(post.body) }} />
      <p style={{ marginTop: 28 }}><Link href="/news/" className="pw-link">← All news</Link></p>
    </article>
  );
}

/* ----------------------------------------------------------- performance */
export function PerformanceBody({ rows, held, ui }: { rows: PerfRow[]; held: number; ui: DesignUi }) {
  if (!rows.length) return <p className="pw-empty">No IPO has listed in the last twelve months.</p>;
  return (
    <>
      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead>
            <tr><th scope="col">IPO</th><th scope="col">Listed on</th><th scope="col" className="pw-r">Issue price</th><th scope="col" className="pw-r">Listing price</th><th scope="col" className="pw-r">Listing gain</th><th scope="col" className="pw-r">Subscribed</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.card.sym}>
                <td><Link href={r.card.href} className="pw-co">{r.card.name}</Link>{r.card.board === 'SME' ? <span className="pw-chip">SME</span> : null}</td>
                <td className="pw-num">{r.listD}</td>
                <td className="pw-num pw-r">{r.issue}</td>
                <td className="pw-num pw-r">{r.listPrice}</td>
                <td className="pw-num pw-r">{r.gain}</td>
                <td className="pw-num pw-r">{r.card.subs || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pw-foot">
        Issues listed in the last twelve months, newest first. Issue price is the upper end of the price band.
        A listing price and gain are shown only where they have been recorded ({held} of {rows.length}); a dash means not recorded, not zero.
        Past listing performance says nothing about any future issue.
      </p>
    </>
  );
}
