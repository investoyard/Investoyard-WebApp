/**
 * Post body renderer — the editor accepts plain text (blank line = paragraph)
 * or pasted HTML. HTML is detected by a leading tag and rendered as-is
 * (operator-authored, trusted); plain text becomes clean <p> paragraphs.
 */
const isHtml = (s: string) => /^\s*</.test(s);

export function PostBody({ body }: { body: string }) {
  if (!body?.trim()) return null;
  if (isHtml(body)) return <div className="prose" dangerouslySetInnerHTML={{ __html: body }} />;
  return (
    <div className="prose">
      {body.split(/\n{2,}/).map((para, i) => (
        <p key={i} style={{ whiteSpace: 'pre-line' }}>{para.trim()}</p>
      ))}
    </div>
  );
}

export const postDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
