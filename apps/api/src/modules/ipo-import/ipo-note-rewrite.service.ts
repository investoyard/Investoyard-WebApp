import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ProviderConfigService } from '../../common/provider-config.service';

/**
 * IPO Note prose rewriter.
 *
 * The Note parser extracts merchant-banker prose verbatim. Verbatim is the
 * fastest publish path but reads like merchant-banker prose, and the copy
 * is also Axis's editorial — not Investoyard's voice, and not necessarily
 * safe to republish as our own. This service takes one field's raw text
 * and asks Claude to redraft it as short, factual, retail-facing
 * sentences.
 *
 * The prompt is deliberately strict on what NOT to do:
 *   • no invented facts (numbers, names, dates, products stay exact)
 *   • no opinions, ratings, or investment recommendations (we distribute,
 *     not advise — the whole product-line commitment)
 *   • no marketing adjectives ("carefully curated", "world-class")
 *   • no headings or lists we didn't ask for
 *
 * The endpoint is deliberately UNBATCHED — one field per call — so a
 * hallucination in one field doesn't pollute another, and the operator
 * sees the model response per row in the review modal.
 *
 * Credentials come from the same 'ai' provider config the WhatsApp
 * chatbot uses (admin → Integrations → Claude AI). No new env var, no
 * new integration surface. If the provider is not configured the
 * endpoint returns a friendly error and the operator falls back to
 * applying the raw extract as-is.
 */
@Injectable()
export class IpoNoteRewriteService {
  private readonly log = new Logger('IpoNoteRewrite');

  constructor(private providers: ProviderConfigService) {}

  async isEnabled(): Promise<boolean> {
    const cfg = await this.providers.effective('ai');
    return !!cfg?.secrets?.apiKey;
  }

  async rewrite(kind: 'description' | 'strength' | 'objects', text: string): Promise<string> {
    if (!text || !text.trim()) throw new BadRequestException('Nothing to rewrite.');
    if (text.length > 12000) throw new BadRequestException('Section is too long — trim before rewriting.');

    const cfg = await this.providers.effective('ai');
    const apiKey = cfg?.secrets?.apiKey;
    if (!apiKey) {
      throw new BadRequestException(
        'Claude AI is not configured. Add an API key in admin → Integrations → Claude AI, then try again.',
      );
    }
    // Rewrite is short-form: Haiku 4.5 is enough. The 'ai' provider's
    // configured default (Opus) is fine for the WhatsApp bot; we override
    // to Haiku here for cost and speed. If sir wants the configured
    // model, that's a one-line change.
    const model = String(cfg?.settings?.rewriteModel || 'claude-haiku-4-5');

    const system = PROMPTS[kind];
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    try {
      const res: any = await client.messages.create({
        model,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: text }],
      });
      const block = (res.content ?? []).find((b: any) => b.type === 'text');
      const html = String(block?.text ?? '').trim();
      if (!html) throw new Error('Model returned an empty response.');
      return sanitiseHtml(html);
    } catch (e: any) {
      this.log.error(`rewrite (${kind}) failed: ${e?.message ?? e}`);
      throw new BadRequestException(`Rewrite failed: ${String(e?.message ?? e)}`);
    }
  }
}

/* ── prompts ──────────────────────────────────────────────────────────────
   One per field. Every prompt names the target field so the model knows
   what shape to produce (paragraphs for prose, bullets for objects), and
   restates the fact-preservation rule — hallucinated numbers on a live
   IPO surface would be the worst possible outcome, so the rule appears in
   every prompt not just this shared preamble. */

const SHARED = [
  'You are helping publish IPO information on Investoyard, a consumer platform in India.',
  'Redraft the merchant-banker prose the user sends into shorter, plainer sentences suitable for retail investors reading on their phone.',
  '',
  'HARD RULES:',
  '- Keep every number, name, date, product, place, percentage and figure EXACTLY as the source has them. Do not invent, adjust, round, or omit any factual detail.',
  '- Do not add opinions, ratings, recommendations, or any language that suggests buying, holding, or avoiding the issue.',
  '- Do not add facts the source does not state — including plausible-sounding context or industry commentary.',
  '- Cut marketing adjectives ("carefully curated", "world-class", "one of the largest", "cutting-edge"). Keep concrete factual claims that DO appear in the source.',
  '- Use Indian English. Prefer short sentences and active voice.',
  '- Output HTML only. No headings, no <h1>-<h6>, no <b>/<strong>, no inline styles.',
  '- If a claim in the source is unclear or ambiguous, drop it rather than guess.',
].join('\n');

const PROMPTS: Record<'description' | 'strength' | 'objects', string> = {
  description: [
    SHARED,
    '',
    'This section is the company description — what the company does. Return 3-6 short <p> paragraphs summarising the business, its products or services, geography, and scale. Focus on what the company sells and who its customers are.',
  ].join('\n'),

  strength: [
    SHARED,
    '',
    'This section is a short company overview — incorporation, promoters, holding structure. Return 1-2 short <p> paragraphs. Keep the promoter names and holding percentages exactly.',
  ].join('\n'),

  objects: [
    SHARED,
    '',
    'This section lists what the fresh issue proceeds will fund. Return a single <ul> with one <li> per object. Keep each amount (in ₹ crore) at the end of the item exactly as written. If an amount is a placeholder ("[•]" or similar), replace it with "amount to be determined".',
  ].join('\n'),
};

/**
 * Belt-and-braces: strip a handful of tags that the prompt forbids in case
 * the model returns them anyway. The IPO form's rich-text editor will
 * happily render <script>/<style>/<iframe> if we let it, and inline
 * styles/onclick would slip through a client-side dompurify. The
 * whitelist is <p>, <ul>, <ol>, <li>, <br>, <em>, <i>.
 */
function sanitiseHtml(html: string): string {
  return html
    // drop code fences the model sometimes wraps its answer in
    .replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '')
    // scripts / styles / iframes — nuke the whole element
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
    // inline event handlers and style attributes
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\sstyle\s*=\s*"[^"]*"/gi, '')
    .replace(/\sstyle\s*=\s*'[^']*'/gi, '')
    // headings — the prompt bans them but the model still tries
    .replace(/<\/?h[1-6][^>]*>/gi, '')
    .trim();
}
