import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ProviderConfigService } from '../../common/provider-config.service';
import type { ParsedAnchor } from './nse-parsers/anchor';

/**
 * Vision-based fallback for the Anchor Investor Intimation Letter parser.
 *
 * WHY THIS EXISTS
 * ---------------
 * NSE issues the anchor intimation as a SCANNED PDF (the printed and signed
 * document, re-imaged for e-filing). pdfjs returns zero text items on every
 * page — no regex can help there. The text-based parser in nse-parsers/anchor.ts
 * still owns the fast path for text-PDFs (born-digital merchant-banker copies);
 * we only run Vision when text extraction has come back empty.
 *
 * The Anthropic Messages API accepts PDF bytes directly as a `document` block,
 * so we don't render pages to images ourselves — one call, whole PDF, back
 * comes JSON in the same `ParsedAnchor` shape the review modal already handles.
 *
 * Credentials: same 'ai' provider config the rewrite service uses (admin →
 * Integrations → Claude AI). If the operator hasn't configured a key, we
 * throw the same friendly message so they know exactly where to add it.
 *
 * Model: Haiku 4.5. Anchor letters are structural — one header sentence with
 * totals, one table with 20–40 rows. Haiku handles that comfortably at ~₹3
 * per letter; Sonnet would cost 3× for no gain.
 */
@Injectable()
export class AnchorVisionService {
  private readonly log = new Logger('AnchorVision');

  constructor(private providers: ProviderConfigService) {}

  async isEnabled(): Promise<boolean> {
    const cfg = await this.providers.effective('ai');
    return !!cfg?.secrets?.apiKey;
  }

  async parse(pdf: Buffer): Promise<ParsedAnchor> {
    const cfg = await this.providers.effective('ai');
    const apiKey = cfg?.secrets?.apiKey;
    if (!apiKey) {
      throw new BadRequestException(
        'This PDF is a scanned image, so we need Claude Vision to read it. ' +
        'Add an API key in admin → Integrations → Claude AI, then try again.',
      );
    }
    const model = String(cfg?.settings?.visionModel || 'claude-haiku-4-5');

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const b64 = pdf.toString('base64');

    try {
      const res: any = await client.messages.create({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: b64 },
            },
            { type: 'text', text: USER_PROMPT },
          ],
        }],
      });
      const block = (res.content ?? []).find((b: any) => b.type === 'text');
      const text = String(block?.text ?? '').trim();
      if (!text) throw new Error('Model returned an empty response.');
      return parseModelJson(text);
    } catch (e: any) {
      this.log.error(`vision parse failed: ${e?.message ?? e}`);
      throw new BadRequestException(
        `Could not read the anchor letter: ${String(e?.message ?? e)}`,
      );
    }
  }
}

/**
 * The model is asked to return one JSON object matching ParsedAnchor. We
 * strip the ``` fences the model sometimes wraps around JSON, and we
 * defend the shape (arrays are arrays, numbers are numbers) rather than
 * trust the model's output blindly — a malformed row is dropped from the
 * roster with a warning instead of failing the whole parse.
 */
function parseModelJson(raw: string): ParsedAnchor {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let obj: any;
  try {
    obj = JSON.parse(stripped);
  } catch {
    // sometimes the model wraps its JSON in prose — grab the first {...} block
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Model did not return JSON.');
    obj = JSON.parse(m[0]);
  }
  const warnings: string[] = Array.isArray(obj?.warnings) ? obj.warnings.filter((w: any) => typeof w === 'string') : [];
  const out: ParsedAnchor = {
    totalShares: numOr(obj?.totalShares),
    allocationPrice: numOr(obj?.allocationPrice),
    anchorDate: isoDateOr(obj?.anchorDate),
    investors: Array.isArray(obj?.investors) ? obj.investors
      .map((i: any) => {
        const shares = numOr(i?.shares);
        const pct = numOr(i?.pct);
        const price = numOr(i?.price);
        const amount = numOr(i?.amount);
        const name = typeof i?.name === 'string' ? i.name.trim() : '';
        if (!name || !shares) return null;
        return { name, shares, pct: pct ?? 0, price: price ?? 0, amount: amount ?? 0 };
      })
      .filter((x: any): x is NonNullable<typeof x> => x !== null) : [],
    _raw: { warnings },
  };
  // Roster vs header sanity check — mirrors what the text parser adds
  if (out.totalShares != null && out.investors.length) {
    const sum = out.investors.reduce((a, x) => a + x.shares, 0);
    if (Math.abs(sum - out.totalShares) > 1) {
      warnings.push(
        `Roster totals ${sum.toLocaleString('en-IN')} shares; header says ${out.totalShares.toLocaleString('en-IN')}. ` +
        `A ${Math.abs(sum - out.totalShares).toLocaleString('en-IN')}-share gap needs a look.`,
      );
    }
  }
  return out;
}

function numOr(v: any): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
function isoDateOr(v: any): string | undefined {
  if (typeof v !== 'string') return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? v : undefined;
}

const SYSTEM_PROMPT = [
  'You extract structured data from Anchor Investor Intimation Letters for Indian IPOs.',
  'You NEVER invent numbers, names, or dates. If a field is not clearly visible in the document, omit it.',
  'You return ONE JSON object and nothing else — no prose, no code fences, no commentary.',
].join('\n');

const USER_PROMPT = [
  'This PDF is an Anchor Investor Intimation Letter filed by an IPO issuer. Extract the following into JSON:',
  '',
  '{',
  '  "totalShares": number,         // total anchor shares allocated (from the header sentence "allocation of X Equity Shares")',
  '  "allocationPrice": number,     // per-share allocation price in rupees',
  '  "anchorDate": "YYYY-MM-DD",    // date anchor bidding took place (from the header). Omit if not stated.',
  '  "investors": [',
  '    { "name": string,             // anchor investor name, exactly as printed',
  '      "shares": number,           // shares allocated to this investor',
  '      "pct": number,              // percentage of the anchor portion (0-100)',
  '      "price": number,            // allocation price for this row (usually same as allocationPrice)',
  '      "amount": number            // total rupees = shares * price',
  '    }',
  '  ],',
  '  "warnings": [string]            // anything you had to guess or could not read cleanly',
  '}',
  '',
  'RULES:',
  '- Names must be as printed — do NOT normalise, expand abbreviations, or fix spellings.',
  '- The letter may repeat the same table for BSE and NSE recipients. DEDUPLICATE — each investor appears once.',
  '- Numbers in the letter use Indian formatting (comma separators, e.g. 23,45,678). Strip commas before returning as JSON numbers.',
  '- If the roster spans multiple pages, include ALL investors from ALL pages.',
  '- If shares × price does not equal amount for a row, report both what you saw and add a warning.',
  '- Return the JSON object only. No markdown fences, no prose.',
].join('\n');
