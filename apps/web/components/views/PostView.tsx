import type { PostView as Post } from '@/lib/api';
import { PostBody, postDate } from '@/components/PostBody';

/** One news post — calm article layout with the IPO cross-link when tagged. */
export function PostView({ post }: { post: Post }) {
  return (
    <article className="trust-page">
      <a href="/news" className="back-link">← News &amp; Updates</a>
      <h1 style={{ marginTop: 12, textWrap: 'balance' as any }}>{post.title}</h1>
      <div className="news-meta" style={{ marginTop: 10 }}>
        {postDate(post.publishedAt)}{post.author ? ` · ${post.author}` : ''}
        {post.tags?.map((t) => <span className="pill" key={t} style={{ marginLeft: 8 }}>{t}</span>)}
      </div>
      {post.coverUrl && <img src={post.coverUrl} alt="" style={{ width: '100%', borderRadius: 14, margin: '18px 0 4px' }} />}
      <PostBody body={post.body ?? ''} />
      {post.ipoSymbol && (
        <div className="panel" style={{ padding: 16, marginTop: 22 }}>
          <div className="between">
            <span style={{ fontWeight: 600 }}>Covering <span className="mono">{post.ipoSymbol}</span></span>
            <a className="btn btn-sm" href={`/ipos/${post.ipoSymbol}`}>View the IPO →</a>
          </div>
        </div>
      )}
      <p className="disclaimer" style={{ marginTop: 20 }}>
        Coverage is informational only — not investment advice. Verify against the issuer&apos;s offer documents.
      </p>
    </article>
  );
}
