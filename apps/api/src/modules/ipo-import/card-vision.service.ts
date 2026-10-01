import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ProviderConfigService } from '../../common/provider-config.service';

/**
 * Parse an IPO SUMMARY CARD image into Add-IPO form fields.
 *
 * WHAT THIS READS. The one-page cards circulated before an issue opens — a
 * header with the company name, an offer block (size, Fresh/OFS split, band,
 * face value, discounts, lot), a category table (Retail / Small HNI / Big HNI
 * with percentages and minimum bids), the QIB-HNI-Retail breakdown, the
 * reservation quota, the intermediaries and the timeline. They are JPEG or PNG,
 * so there is no text layer at all and Vision is the ONLY route — unlike the
 * anchor letter, where Vision is a fallback behind a text parser.
 *
 * WHAT IT DELIBERATELY DOES NOT RETURN AS A FIELD
 * -----------------------------------------------
 * The card's "Application Reserved" row. Checked against two real cards on
 * 2026-10-01 and it carries the SAME ~4.8x error this codebase fixed on
 * 2026-09-29 — it divides Big-HNI shares by the SMALL-HNI minimum bid:
 *
 *   VNL     bHNI  15,63,973 / 952   = 1,643  (card)   / 4,556  =  344  (true)
 *   NITYAS  bHNI  14,35,600 / 2,798 =   513  (card)   /13,400  =  108  (true)
 *
 * Retail matched our figure to the application on both, and sHNI differed by
 * one on NITYAS because the card FLOORS where applications-to-reach-1x CEILS.
 * It is not a storable field anyway — the form strips `req1x` on save AND on
 * load — so it comes back under `crossCheck`, for the review modal to show
 * BESIDE our own derivation and never as something to write.
 *
 * Credentials and model: the same 'ai' provider the anchor Vision service uses
 * (admin → Integrations → Claude AI).
 */
/**
 * The image types the Messages API accepts. Exported as the TYPE and the list so
 * the controller's whitelist and the SDK call cannot drift: the SDK types
 * media_type as exactly this union, which is what caught a plain string here.
 */
export const CARD_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type CardMime = (typeof CARD_MIMES)[number];
export const isCardMime = (m: string): m is CardMime => (CARD_MIMES as readonly string[]).includes(m);

@Injectable()
export class CardVisionService {
  private readonly log = new Logger('CardVision');

  constructor(private providers: ProviderConfigService) {}

  async parse(image: Buffer, mime: CardMime): Promise<ParsedCard> {
    const cfg: any = await this.providers.effective('ai');
    const apiKey = cfg?.secrets?.apiKey;
    if (!apiKey) {
      throw new BadRequestException(
        'Reading an IPO card needs Claude Vision. '
        + 'Add an API key in admin → Integrations → Claude AI, then try again.',
      );
    }
    const model = String(cfg?.settings?.visionModel || 'claude-haiku-4-5');

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    try {
      const res: any = await client.messages.create({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: image.toString('base64') } },
            { type: 'text', text: USER_PROMPT },
          ],
        }],
      });
      const block = (res.content ?? []).find((b: any) => b.type === 'text');
      const text = String(block?.text ?? '').trim();
      if (!text) throw new Error('Model returned an empty response.');
      return parseModelJson(text);
    } catch (e: any) {
      this.log.error(`card parse failed: ${e?.message ?? e}`);
      throw new BadRequestException(`Could not read the card: ${String(e?.message ?? e)}`);
    }
  }
}

/** Everything a card can state. EVERY FIELD IS OPTIONAL — a card that omits one
 *  must leave the form's value untouched rather than blank it. */
export interface ParsedCard {
  name?: string | null;
  issueSizeCr?: number | null;
  fresh?: { basis: 'amount' | 'shares'; value: number } | null;
  ofs?: { basis: 'amount' | 'shares'; value: number } | null;
  priceBandMin?: number | null;
  priceBandMax?: number | null;
  faceValue?: number | null;
  lotSize?: number | null;
  employeeDiscount?: number | null;
  retailDiscount?: number | null;
  shareholderDiscount?: number | null;
  /** percentages of the offer, as the card prints them */
  reservation?: Record<string, number> | null;
  /** per-category share counts, when the card states them */
  shares?: Record<string, number> | null;
  carveout?: { key: string; shares: number | null; amountCr: number | null } | null;
  anchorDate?: string | null;
  openDate?: string | null;
  closeDate?: string | null;
  allotmentDate?: string | null;
  refundDate?: string | null;
  dematDate?: string | null;
  listingDate?: string | null;
  leadManagers: string[];
  registrar?: string | null;
  exchanges: string[];
  /** NOT writable — shown beside our own derivation. See the class comment. */
  crossCheck: { minBid: Record<string, number> | null; applications: Record<string, number> | null };
  warnings: string[];
}

const SYSTEM_PROMPT = [
  'You read Indian IPO summary cards and return STRICT JSON.',
  'Return ONLY a JSON object. No prose, no markdown fences.',
  'Every field is optional: OMIT a field the card does not state rather than guessing.',
  'Never compute a value the card does not print. If the card shows a figure, report it',
  'verbatim; if it does not, leave the field out and say so in warnings.',
  'Rupee amounts in crore are the number alone (Rs 178 Cr -> 178). Share counts are plain',
  'integers with separators removed (6,590,909 -> 6590909). Percentages are numbers',
  '(9.67% -> 9.67). Dates are ISO yyyy-mm-dd.',
].join('\n');

const USER_PROMPT = [
  'Read this IPO summary card and return JSON with these keys, omitting any the card does not state:',
  '',
  'name, issueSizeCr, fresh {basis:"amount"|"shares", value}, ofs {same},',
  'priceBandMin, priceBandMax, faceValue, lotSize,',
  'employeeDiscount, retailDiscount, shareholderDiscount,',
  'reservation {qib, hni, hni2, retail},',
  'shares {qib, hni, hni2, retail},',
  'carveout {key:"employee"|"shareholder"|"policyholder", shares, amountCr},',
  'anchorDate, openDate, closeDate, allotmentDate, refundDate, dematDate, listingDate,',
  'leadManagers [], registrar, exchanges [],',
  'crossCheck { minBid {retail, hni2, hni}, applications {retail, hni2, hni} },',
  'warnings []',
  '',
  'RULES',
  '- hni means BIG HNI (10 Lakh+). hni2 means SMALL HNI (2-10 Lakh). The category table',
  '  prints them as Retail, Small HNI, Big HNI in that order. Do NOT swap hni and hni2.',
  '- "Issue Detail" usually gives BOTH a share count and a rupee value per leg. Prefer',
  '  basis "shares" when a share count is printed, otherwise "amount" in crore.',
  '- "Min Bid Lot Shares" and "Application Reserved" belong in crossCheck, never in shares.',
  '- "No Anchor Quota", "No Offer For Sale", "No Reservation" mean the field is ABSENT:',
  '  omit it and add a warning naming what the card said.',
  '- A discount row may be filled on a card that also says there is no reservation. Report',
  '  both as printed and add a warning; do not reconcile them yourself.',
  '- If a value is unreadable or ambiguous, omit it and add a warning naming which.',
].join('\n');

function numOr(v: any): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
const strOr = (v: any): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const isoOr = (v: any): string | null =>
  (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
const strList = (v: any): string[] =>
  (Array.isArray(v) ? v.filter((s: any) => typeof s === 'string' && s.trim()).map((s: string) => s.trim()) : []);

function legOr(v: any): { basis: 'amount' | 'shares'; value: number } | null {
  const value = numOr(v?.value);
  if (value == null || value <= 0) return null;
  return { basis: v?.basis === 'shares' ? 'shares' : 'amount', value };
}

function mapNums(o: any, keys: string[]): Record<string, number> | null {
  if (!o || typeof o !== 'object') return null;
  const out: Record<string, number> = {};
  for (const k of keys) { const n = numOr(o[k]); if (n != null && n > 0) out[k] = n; }
  return Object.keys(out).length ? out : null;
}

/**
 * Defend the shape rather than trust the model: a malformed field is dropped,
 * never written through to the form. The review modal shows the operator every
 * value before anything is applied, but a field that arrives as the wrong type
 * should not reach that screen at all.
 */
function parseModelJson(raw: string): ParsedCard {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let obj: any;
  try {
    obj = JSON.parse(stripped);
  } catch {
    // the model occasionally wraps its JSON in prose — take the first {...}
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Model did not return JSON.');
    obj = JSON.parse(m[0]);
  }
  const cv = obj?.carveout;
  const carveKey = ['employee', 'shareholder', 'policyholder'].includes(cv?.key) ? String(cv.key) : null;

  return {
    name: strOr(obj?.name),
    issueSizeCr: numOr(obj?.issueSizeCr),
    fresh: legOr(obj?.fresh),
    ofs: legOr(obj?.ofs),
    priceBandMin: numOr(obj?.priceBandMin),
    priceBandMax: numOr(obj?.priceBandMax),
    faceValue: numOr(obj?.faceValue),
    lotSize: numOr(obj?.lotSize),
    employeeDiscount: numOr(obj?.employeeDiscount),
    retailDiscount: numOr(obj?.retailDiscount),
    shareholderDiscount: numOr(obj?.shareholderDiscount),
    reservation: mapNums(obj?.reservation, ['qib', 'hni', 'hni2', 'retail']),
    shares: mapNums(obj?.shares, ['qib', 'hni', 'hni2', 'retail']),
    carveout: carveKey ? { key: carveKey, shares: numOr(cv?.shares), amountCr: numOr(cv?.amountCr) } : null,
    anchorDate: isoOr(obj?.anchorDate),
    openDate: isoOr(obj?.openDate),
    closeDate: isoOr(obj?.closeDate),
    allotmentDate: isoOr(obj?.allotmentDate),
    refundDate: isoOr(obj?.refundDate),
    dematDate: isoOr(obj?.dematDate),
    listingDate: isoOr(obj?.listingDate),
    leadManagers: strList(obj?.leadManagers),
    registrar: strOr(obj?.registrar),
    exchanges: strList(obj?.exchanges),
    crossCheck: {
      minBid: mapNums(obj?.crossCheck?.minBid, ['retail', 'hni2', 'hni']),
      applications: mapNums(obj?.crossCheck?.applications, ['retail', 'hni2', 'hni']),
    },
    warnings: Array.isArray(obj?.warnings) ? obj.warnings.filter((w: any) => typeof w === 'string') : [],
  };
}
