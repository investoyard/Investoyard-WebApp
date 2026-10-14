/**
 * Per-tenant SITE CONTENT — who the operator of a white-label site is, and how
 * a visitor reaches them.
 *
 * WHY THIS EXISTS. Until now a partner's white-label domain served OUR identity:
 * every trust page named Safal Capital Services Private Limited, the footer said
 * Investoyard, and the Organization structured data on every page declared our
 * legal name and our logo. That is worse than a missing feature — a visitor on a
 * broker's domain was being told, in the page's own machine-readable metadata,
 * that they were dealing with us.
 *
 * THE ONE RULE THIS MODULE ENCODES: A WHITE-LABEL NEVER INHERITS OUR IDENTITY.
 * Falling back to our legal name, our SEBI registration or our grievance officer
 * would keep a partner's site looking complete while publishing a false
 * statement about who is accountable for it. `resolveIdentity` therefore only
 * ever substitutes for the DEFAULT tenant, and `contentGaps()` names what a
 * partner still has to supply so the omission is visible to our staff rather
 * than silently papered over.
 *
 * Shared because three surfaces read the same shape: the web footer and contact
 * page render it, the API validates and serves it, and mobile will show the
 * operating entity on its Account tab.
 */

/* ------------------------------------------------------------------ shapes */

/**
 * Who the operator of this site is, legally.
 *
 * Every field is optional: a partner is approved before their compliance team
 * has necessarily handed over a CIN, and a half-filled identity that renders
 * what it has beats a form that refuses to save.
 */
export interface TenantIdentity {
  /** The registered company name, e.g. "Safal Capital Services Private Limited". */
  legalName?: string;
  /**
   * The name customers know, when it differs from the legal one. Defaults to the
   * tenant's own `name`, which is already what the site's header and brand show.
   */
  tradeName?: string;
  /** SEBI registration, as it must be displayed, e.g. "INZ000123456". */
  sebiRegistration?: string;
  /** Corporate Identity Number. */
  cin?: string;
  gstin?: string;
  /** The registered office address, as a single block (newlines kept). */
  registeredAddress?: string;
}

/**
 * How a visitor reaches the operator — including the two people SEBI requires a
 * registered intermediary to name.
 *
 * The grievance officer is NOT optional in spirit: a SEBI-registered broker must
 * publish a designated grievance redressal officer, and ours standing on their
 * page would send their clients' complaints to us. It is optional in the TYPE
 * only so a partner can be set up in stages; `contentGaps()` is what insists.
 */
export interface TenantContact {
  supportEmail?: string;
  supportPhone?: string;
  /** Free text, e.g. "Mon-Fri, 9:00am - 6:00pm IST". */
  hours?: string;
  /** Where customers may visit or write (newlines kept). */
  officeAddress?: string;
  grievanceName?: string;
  grievanceEmail?: string;
  grievancePhone?: string;
  complianceName?: string;
  complianceEmail?: string;
  compliancePhone?: string;
}

/**
 * The content blocks a tenant may publish, one per row of `TenantContent`.
 *
 * A ROW PER KEY rather than one blob, deliberately: this codebase has twice paid
 * for two writers racing over a single unschema'd JSON column — the admin IPO
 * form deleting the poller's `extra` keys, and the poller reverting the
 * operator's — and both faults are the same shape, last write wins the whole
 * object. Separate rows mean saving `contact` cannot touch `identity`, with no
 * whitelist to maintain.
 *
 * `identity` and `contact` are small scalar sets and ride on the public
 * `/tenants` registry the site already fetches once on mount. The rich-text keys
 * (about, terms, privacy, disclaimer) are deliberately NOT in that list — they
 * are fetched by the page that renders them, so a reader of the home page never
 * downloads every partner's legal prose.
 */
export const TENANT_CONTENT_KEYS = ['identity', 'contact'] as const;
export type TenantContentKey = (typeof TENANT_CONTENT_KEYS)[number];

/** Everything a site needs about its own operator. Both halves may be absent. */
export interface TenantContent {
  identity?: TenantIdentity;
  contact?: TenantContact;
}

/* -------------------------------------------------------------- our own copy */

/**
 * OUR identity, and the fallback for the DEFAULT tenant alone.
 *
 * Only the two fields the public pages already state. A SEBI registration, CIN
 * or GSTIN is deliberately absent rather than guessed — publishing an invented
 * registration number is a far worse failure than publishing none, and these
 * belong in the database where the operator can enter the real values once.
 */
export const DEFAULT_IDENTITY: Readonly<TenantIdentity> = Object.freeze({
  legalName: 'Safal Capital Services Private Limited',
  tradeName: 'Investoyard',
});

/* ---------------------------------------------------------------- resolvers */

const trim = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : undefined;
};

/** Drop empty strings so a blanked field reads as absent, not as "". */
function compact<T extends object>(o: T | undefined): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o ?? {})) {
    const s = trim(v);
    if (s !== undefined) out[k] = s;
  }
  return out as Partial<T>;
}

export interface IdentityInput {
  /** True only for the Investoyard Direct channel. */
  isDefault: boolean;
  /** The tenant's own display name — a legitimate trade name for anyone. */
  name: string;
  identity?: TenantIdentity;
}

/**
 * The identity to PUBLISH for this tenant.
 *
 * For the default channel, our constants fill what the operator has not entered.
 * For everyone else the ONLY thing supplied is `tradeName`, from the tenant's own
 * name — which is already on their header and in their brand, so it states
 * nothing new. A partner's legal name, registration and address come from the
 * partner or they are not published at all.
 */
export function resolveIdentity({ isDefault, name, identity }: IdentityInput): TenantIdentity {
  const own = compact(identity);
  if (isDefault) return { ...DEFAULT_IDENTITY, ...own };
  return { tradeName: trim(name), ...own };
}

/** The contact block to publish. Never substituted across tenants, at all. */
export function resolveContact(contact?: TenantContact): TenantContact {
  return compact(contact);
}

/**
 * The name to show a customer: the trade name, else the legal name, else the
 * tenant's own name. Never empty, because the footer and the page title both
 * need something to print.
 */
export function displayName(input: IdentityInput): string {
  const id = resolveIdentity(input);
  return id.tradeName ?? id.legalName ?? input.name;
}

/**
 * The accountable entity, for the footer's copyright line and the structured
 * data's `legalName`. Undefined when nothing has been entered — the caller must
 * then say nothing rather than fall back to a brand name, because a trade name
 * presented as the legal operator is the exact misstatement this module exists
 * to prevent.
 */
export function legalEntity(input: IdentityInput): string | undefined {
  return resolveIdentity(input).legalName;
}

/* ------------------------------------------------------------------- writes */

/**
 * Merge an admin patch onto a stored content block.
 *
 * A BLANKED FIELD DELETES, it does not store "". The admin form posts every box
 * it renders, so an untouched-but-empty box and a cleared one arrive
 * identically — storing the empty string would leave the row growing a tail of
 * `""` values that read as present to anything that only checks for the key.
 *
 * Fields the patch does not mention are LEFT ALONE, so a panel that later
 * renders a subset of the block cannot wipe the rest. That is the same reasoning
 * as the per-key rows themselves, one level down.
 */
export function mergeContentPatch<T extends object>(
  existing: T | undefined,
  patch: Partial<Record<keyof T, unknown>>,
): T {
  const out: Record<string, unknown> = { ...compact(existing ?? ({} as T)) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const s = trim(v);
    if (s === undefined) delete out[k];
    else out[k] = s;
  }
  return out as T;
}

/* -------------------------------------------------------------------- gaps */

export interface ContentGap {
  key: TenantContentKey;
  field: string;
  /** What our staff should see in the admin panel. */
  label: string;
  /**
   * `blocking` means the site should not be handed to the partner's customers
   * until it is filled; `advisory` is a real gap that is not yet a liability.
   */
  severity: 'blocking' | 'advisory';
}

/**
 * What a white-label still has to supply, in the order staff should chase it.
 *
 * BLOCKING is reserved for the three statements whose ABSENCE is survivable but
 * whose being WRONG is not: without a legal name the footer has no accountable
 * entity, and without a grievance officer's name and email a SEBI-registered
 * broker's clients have nowhere to complain — and the only alternative on offer
 * would be ours.
 *
 * Returns nothing for the default channel: our own site's gaps are ours to
 * manage, and listing them beside a partner's would read as the same obligation.
 */
export function contentGaps(input: IdentityInput & { contact?: TenantContact }): ContentGap[] {
  if (input.isDefault) return [];
  const id = resolveIdentity(input);
  const c = resolveContact(input.contact);
  const gaps: ContentGap[] = [];
  const need = (
    key: TenantContentKey,
    field: string,
    label: string,
    severity: ContentGap['severity'],
    value: string | undefined,
  ) => { if (!value) gaps.push({ key, field, label, severity }); };

  need('identity', 'legalName', 'Registered company name', 'blocking', id.legalName);
  need('contact', 'grievanceName', 'Grievance officer name', 'blocking', c.grievanceName);
  need('contact', 'grievanceEmail', 'Grievance officer email', 'blocking', c.grievanceEmail);
  need('contact', 'supportEmail', 'Support email', 'advisory', c.supportEmail);
  need('contact', 'supportPhone', 'Support phone', 'advisory', c.supportPhone);
  need('identity', 'sebiRegistration', 'SEBI registration number', 'advisory', id.sebiRegistration);
  need('identity', 'registeredAddress', 'Registered office address', 'advisory', id.registeredAddress);
  return gaps;
}

/** True when nothing blocking is outstanding — the Phase 1 half of go-live. */
export function contentReady(input: IdentityInput & { contact?: TenantContact }): boolean {
  return !contentGaps(input).some((g) => g.severity === 'blocking');
}
