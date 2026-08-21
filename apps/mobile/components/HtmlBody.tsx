/**
 * Light HTML renderer for news-post bodies (the TipTap subset our admin editor
 * produces: p/h1-3/ul/ol/blockquote/img/table + b/i/u/a/mark inline). No
 * external HTML libraries — parses to native <Text>/<Image> blocks. Unknown
 * tags degrade to plain text, so a future editor feature never crashes a post.
 */
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { fonts, ui } from '../lib/theme';

interface Seg { text: string; bold?: boolean; italic?: boolean; underline?: boolean; mark?: boolean; href?: string }
type Block =
  | { kind: 'text'; tag: 'p' | 'h1' | 'h2' | 'h3' | 'li' | 'blockquote'; segs: Seg[]; ordinal?: number }
  | { kind: 'img'; src: string };

const decode = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
  .replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“').replace(/&#\d+;/g, '');

/** inline HTML → styled segments (tag stack walk) */
function parseInline(html: string): Seg[] {
  const segs: Seg[] = [];
  const stack: { tag: string; href?: string }[] = [];
  const re = /<\/?([a-z0-9]+)([^>]*)>/gi;
  let idx = 0;
  let m: RegExpExecArray | null;
  const pushText = (raw: string) => {
    const text = decode(raw.replace(/\s+/g, ' '));
    if (!text) return;
    const seg: Seg = { text };
    for (const s of stack) {
      if (s.tag === 'b' || s.tag === 'strong') seg.bold = true;
      else if (s.tag === 'i' || s.tag === 'em') seg.italic = true;
      else if (s.tag === 'u') seg.underline = true;
      else if (s.tag === 'mark') seg.mark = true;
      else if (s.tag === 'a' && s.href) seg.href = s.href;
    }
    segs.push(seg);
  };
  while ((m = re.exec(html))) {
    pushText(html.slice(idx, m.index));
    idx = m.index + m[0].length;
    const tag = m[1].toLowerCase();
    if (tag === 'br') { segs.push({ text: '\n' }); continue; }
    if (m[0][1] === '/') {
      const at = stack.map((s) => s.tag).lastIndexOf(tag);
      if (at >= 0) stack.splice(at, 1);
    } else if (!m[0].endsWith('/>')) {
      const href = tag === 'a' ? /href="([^"]*)"/i.exec(m[2])?.[1] : undefined;
      stack.push({ tag, href });
    }
  }
  pushText(html.slice(idx));
  return segs;
}

/** document HTML → ordered blocks */
function parseBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const re = /<(h1|h2|h3|p|blockquote|ul|ol|table)[^>]*>([\s\S]*?)<\/\1>|<img[^>]*src="([^"]*)"[^>]*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[3]) { blocks.push({ kind: 'img', src: m[3] }); continue; }
    const tag = m[1].toLowerCase();
    const inner = m[2];
    if (tag === 'ul' || tag === 'ol') {
      const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
      items.forEach(([, li], i) => {
        const segs = parseInline(li.replace(/<\/?p[^>]*>/gi, ''));
        if (segs.length) blocks.push({ kind: 'text', tag: 'li', segs, ordinal: tag === 'ol' ? i + 1 : undefined });
      });
    } else if (tag === 'table') {
      // tables degrade to "cell · cell · cell" lines — readable, never overflowing
      for (const [, row] of inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
          .map(([, c]) => decode(c.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
          .filter(Boolean);
        if (cells.length) blocks.push({ kind: 'text', tag: 'p', segs: [{ text: cells.join('  ·  ') }] });
      }
    } else {
      const segs = parseInline(inner);
      if (segs.length) blocks.push({ kind: 'text', tag: tag as any, segs });
    }
  }
  // plain-text body (no block tags at all) → paragraphs on blank lines
  if (blocks.length === 0 && html.trim()) {
    for (const para of html.split(/\n{2,}/)) {
      const t = decode(para.replace(/<[^>]+>/g, ' ')).trim();
      if (t) blocks.push({ kind: 'text', tag: 'p', segs: [{ text: t }] });
    }
  }
  return blocks;
}

const TAG_STYLE = {
  p: { fontSize: 14.5, lineHeight: 22, fontFamily: fonts.regular, color: ui.body },
  h1: { fontSize: 20, lineHeight: 26, fontFamily: fonts.extrabold, fontWeight: '800' as const, color: ui.title, letterSpacing: -0.3 },
  h2: { fontSize: 17, lineHeight: 23, fontFamily: fonts.extrabold, fontWeight: '800' as const, color: ui.title, letterSpacing: -0.2 },
  h3: { fontSize: 15.5, lineHeight: 21, fontFamily: fonts.bold, fontWeight: '700' as const, color: ui.title },
  li: { fontSize: 14.5, lineHeight: 22, fontFamily: fonts.regular, color: ui.body },
  blockquote: { fontSize: 14.5, lineHeight: 22, fontFamily: fonts.regular, color: ui.slate, fontStyle: 'italic' as const },
};

export function HtmlBody({ html }: { html: string }) {
  const blocks = parseBlocks(html);
  return (
    <View style={{ gap: 10 }}>
      {blocks.map((b, i) => {
        if (b.kind === 'img') {
          return <Image key={i} source={{ uri: b.src }} style={styles.img} resizeMode="cover" />;
        }
        const body = (
          <Text style={TAG_STYLE[b.tag]}>
            {b.segs.map((s, j) => (
              <Text
                key={j}
                onPress={s.href ? () => Linking.openURL(s.href!).catch(() => {}) : undefined}
                style={[
                  s.bold && { fontFamily: fonts.bold, fontWeight: '700' },
                  s.italic && { fontStyle: 'italic' },
                  s.underline && { textDecorationLine: 'underline' },
                  s.mark && { backgroundColor: '#FFF3B0' },
                  s.href != null && { color: ui.indigo, textDecorationLine: 'underline' },
                ]}
              >
                {s.text}
              </Text>
            ))}
          </Text>
        );
        if (b.tag === 'li') {
          return (
            <View key={i} style={styles.liRow}>
              <Text style={styles.liDot}>{b.ordinal != null ? `${b.ordinal}.` : '•'}</Text>
              <View style={{ flex: 1 }}>{body}</View>
            </View>
          );
        }
        if (b.tag === 'blockquote') {
          return <View key={i} style={styles.quote}>{body}</View>;
        }
        return <View key={i}>{body}</View>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  img: { width: '100%', height: 190, borderRadius: 14, backgroundColor: ui.slateTint },
  liRow: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  liDot: { fontSize: 14.5, lineHeight: 22, fontFamily: fonts.bold, fontWeight: '700', color: ui.indigo, minWidth: 16 },
  quote: { borderLeftWidth: 3, borderLeftColor: ui.divider, paddingLeft: 12 },
});
