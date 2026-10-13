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
  '- A card usually prints a COMBINED HNI line AND two sub-lines under it, like:',
  '      HNI 15% of the offer',
  '        HNI Small (2-10 Lakh) 5%',
  '        HNI Large (10 Lakh+) 10%',
  '  Use the SUB-LINES: hni2 = 5, hni = 10. The combined 15 is their total and belongs',
  '  in NEITHER field. Putting it in hni is the single most damaging mistake you can',
  '  make on this card, so check it twice.',
  '- qib + hni + hni2 + retail should come to about 100. If your four numbers do not,',
  '  you have almost certainly taken the combined HNI line instead of Big HNI. Re-read',
  '  the sub-lines, and if the total still does not reconcile say so in warnings.',
  '- "Issue Detail" has ONE LINE PER LEG and each line names its own leg. Attach a',
  '  figure ONLY to the leg named on the line it appears on. A line reading',
  '  "26,284,500 OFS Shares worth Rs 712.13 Cr." is the OFS leg and nothing else —',
  '  it must never be reported as fresh. A card may legitimately have only one leg.',
  '- Each leg line usually gives BOTH a share count and a rupee value. Prefer basis',
  '  "shares" when a share count is printed, otherwise "amount" in crore.',
  '- "Min Bid Lot Shares" and "Application Reserved" belong in crossCheck, never in shares.',
  '- "No Fresh Issue", "No Anchor Quota", "No Offer For Sale", "No Reservation" mean that',
  '  field is ABSENT: OMIT it entirely and add a warning naming what the card said. Do',
  '  not move the other leg\'s figures into the omitted one to fill the gap.',
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
/**
 * THE COMBINED-HNI MISREAD, caught arithmetically rather than hoped away.
 *
 * Every card prints a combined `HNI 15%` line above its two sub-lines, and on
 * the first real card (HD Fire Protect, 2026-10-07) the model reported that 15
 * as Big HNI against a true 10. The prompt now warns about it twice, but a
 * prompt is a request and this is a check.
 *
 * The signal is unambiguous when it fires: the four categories come to about
 * 105 instead of 100, AND dropping `hni2` brings them to exactly 100 — which is
 * what you get when `hni` already contains `hni2`.
 *
 * It DROPS the suspect figure rather than correcting it to `hni - hni2`. This
 * parser's whole contract is that it never computes a value the card does not
 * print, and a dropped field leaves the form's existing value alone; a
 * corrected one would arrive pre-ticked and be believed. The warning names the
 * arithmetic so the operator can settle it from the card in seconds.
 */
function flagCombinedHni(reservation: Record<string, number> | null, warnings: string[]): Record<string, number> | null {
  if (!reservation) return reservation;
  const { qib = 0, hni = 0, hni2 = 0, retail = 0 } = reservation;
  if (!(qib > 0 && hni > 0 && hni2 > 0 && retail > 0)) return reservation;
  const all = qib + hni + hni2 + retail;
  const withoutSmall = qib + hni + retail;
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;
  if (!near(all, 100) && near(withoutSmall, 100)) {
    warnings.push(
      `Big HNI was read as ${hni}%, but the four categories then total ${all.toFixed(2)}% `
      + `instead of 100%. Dropping Small HNI brings them to ${withoutSmall.toFixed(2)}%, which means `
      + `${hni}% is the COMBINED HNI line and Big HNI is probably ${(hni - hni2).toFixed(2)}%. `
      + 'Big HNI has been left out rather than filled in wrongly — enter it from the card.',
    );
    const { hni: _drop, ...rest } = reservation;
    return rest;
  }
  return reservation;
}

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

  /* Built BEFORE the return so the guard below can append to it. */
  const warnings: string[] = Array.isArray(obj?.warnings)
    ? obj.warnings.filter((w: any) => typeof w === 'string')
    : [];
  const reservation = flagCombinedHni(mapNums(obj?.reservation, ['qib', 'hni', 'hni2', 'retail']), warnings);

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
    reservation,
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
    warnings,
  };
}

/**
 * The JSON defence, reachable from a spec.
 *
 * `parseModelJson` is the half of this service that does not need an API key or
 * a network call, and it is where the shape is defended and the combined-HNI
 * misread is caught. Exported under its own name so `card-vision.spec.ts` can
 * drive it with the exact payloads the model has actually returned — the same
 * reason `parseAnchorRows` was split out of `parseAnchor`.
 */
export const parseCardJsonForTest = (raw: string): ParsedCard => parseModelJson(raw);
