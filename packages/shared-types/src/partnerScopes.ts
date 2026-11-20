/**
 * The Partner API's scopes — ONE list, read by the API's scope guard, the
 * admin tenant page, the key panels and the docs.
 *
 * It lived in two places (`PARTNER_SCOPES` in the API and a `SCOPE_META` copy
 * in the admin tenant page, with a comment asking the two to be kept in step),
 * which is how a scope gets added to the guard and never offered on the screen.
 *
 * TWO LEVELS, AND A KEY CAN NEVER EXCEED ITS PARTNER (Phase 1, 2026-11-20):
 * - the TENANT's list is what the operator has switched on for that partner;
 * - a KEY may carry its own, smaller list — a reporting backend that only
 *   reads allotment results should not hold a key that can print forms.
 * An empty key list means "everything the partner has", so every key issued
 * before key scopes existed keeps working exactly as before.
 */

export interface PartnerScopeMeta {
  key: string;
  label: string;
  /** what it opens, in the words an operator reads on the tenant page */
  hint: string;
  /** the endpoints it opens, as the docs list them */
  endpoints: string[];
  /** offered to a new partner without the operator ticking it */
  byDefault: boolean;
}

export const PARTNER_SCOPE_META = [
  {
    key: 'print-forms',
    label: 'Print forms',
    hint: 'Send final application data and get the prefilled ASBA forms back as one PDF.',
    endpoints: ['POST /partner/v1/print-forms'],
    byDefault: true,
  },
  {
    key: 'prints:read',
    label: 'Print records',
    hint: 'List the forms this partner has printed, read one, and download its PDF again with the same form number.',
    endpoints: ['GET /partner/v1/prints', 'GET /partner/v1/prints/detail', 'GET /partner/v1/prints/pdf'],
    byDefault: false,
  },
  {
    key: 'allotment:read',
    label: 'Allotment results',
    hint: 'Allotment outcome for each of this partner’s own applications, once the registrar file is in.',
    endpoints: ['GET /partner/v1/allotment'],
    byDefault: false,
  },
  {
    key: 'bids:write',
    label: 'Place bids',
    hint: 'Place UPI bids for clients under our exchange membership, and modify, cancel or change their UPI ID. Test keys go to a simulator.',
    endpoints: ['POST /partner/v1/bids', 'POST /partner/v1/bids/modify', 'POST /partner/v1/bids/cancel', 'POST /partner/v1/bids/upi'],
    byDefault: false,
  },
  {
    key: 'bids:read',
    label: 'Bid status',
    hint: 'Read the status of this partner’s bids — one, a list, or counts per IPO.',
    endpoints: ['GET /partner/v1/bids', 'GET /partner/v1/bids/summary', 'GET /partner/v1/bids/limits'],
    byDefault: false,
  },
  {
    key: 'ipos:read',
    label: 'IPO catalog',
    hint: 'Read the live IPO list and each issue’s detail.',
    endpoints: ['GET /partner/v1/ipos', 'GET /partner/v1/ipos/{symbol}'],
    byDefault: true,
  },
  {
    key: 'subscription:read',
    label: 'Subscription snapshot',
    hint: 'Subscription figures from the exchange. Opt-in per partner.',
    endpoints: ['GET /partner/v1/ipos/{symbol}/subscription'],
    byDefault: false,
  },
  {
    key: 'gmp:read',
    label: 'Grey Market Premium',
    hint: 'GMP with its disclaimer. Opt-in per partner; off for any partner whose GMP is switched off.',
    endpoints: ['GET /partner/v1/ipos/{symbol}/gmp'],
    byDefault: false,
  },
] as const satisfies readonly PartnerScopeMeta[];

export type PartnerScope = (typeof PARTNER_SCOPE_META)[number]['key'];

export const PARTNER_SCOPES: readonly PartnerScope[] = PARTNER_SCOPE_META.map((s) => s.key);

/** Matches the schema default on `Tenant.partnerApiScopes`. */
export const DEFAULT_PARTNER_SCOPES: PartnerScope[] = PARTNER_SCOPE_META.filter((s) => s.byDefault).map((s) => s.key);

export const isPartnerScope = (s: unknown): s is PartnerScope =>
  typeof s === 'string' && (PARTNER_SCOPES as readonly string[]).includes(s);

/**
 * The scopes a key may actually use: its own list, narrowed to what the
 * partner has — or, when the key has no list of its own, the partner's.
 *
 * Intersected HERE rather than trusted from either side, so a scope the
 * operator later switches OFF for a partner stops working on every key at
 * once, including keys that were issued with it. Unknown names are dropped.
 */
export function effectiveKeyScopes(tenantScopes: readonly string[], keyScopes?: readonly string[] | null): PartnerScope[] {
  const tenant = tenantScopes.filter(isPartnerScope);
  if (!keyScopes || keyScopes.length === 0) return tenant;
  const allowed = new Set<string>(tenant);
  return keyScopes.filter((s): s is PartnerScope => isPartnerScope(s) && allowed.has(s));
}

/**
 * Why a key cannot be given this list, or null when it can. A key may only
 * carry scopes its partner has; refusing at issue time beats a key that looks
 * like it can print and is quietly narrowed to nothing.
 */
export function keyScopesProblem(tenantScopes: readonly string[], keyScopes: readonly string[]): string | null {
  const unknown = keyScopes.filter((s) => !isPartnerScope(s));
  if (unknown.length) return `Unknown scope: ${unknown.join(', ')}.`;
  const allowed = new Set(tenantScopes);
  const missing = keyScopes.filter((s) => !allowed.has(s));
  if (missing.length) {
    return `This partner does not have ${missing.join(', ')} switched on, so a key cannot be given it. Switch it on for the partner first.`;
  }
  return null;
}
