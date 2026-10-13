import type { Depository } from './index';

/**
 * A profile's demat accounts, as one list.
 *
 * THE PROFILE'S OWN COLUMNS ARE THE DEFAULT DEMAT and are never copied into the
 * `DematAccount` table — see the model's note in `schema.prisma`. That keeps each
 * demat in exactly one place, but it means "the accounts on this profile" is two
 * sources joined, and a join written at each call site is how four readers of
 * `sharesUpper` ended up disagreeing. So it is written ONCE, here, and the API,
 * both apps and anything else all read the result.
 *
 * The default is FIRST when there is one. The schema makes a profile's demat
 * mandatory, so a blank one is a legacy or half-written record — and its extras
 * are still listed, with nothing marked default. Hiding real accounts because
 * the default is missing would stop the investor applying at all, which is a
 * worse answer than a list with no default in it.
 */
export interface DematAccountView {
  /**
   * `null` means the profile's own default. An application stores exactly this —
   * null for the default — so a bid placed before multiple demats existed still
   * means what it always meant, and no backfill was needed.
   */
  id: string | null;
  depository: Depository;
  dpId: string;
  clientId: string;
  /** the investor's own name for it — "Zerodha", "HDFC Sec" */
  label?: string | null;
  isDefault: boolean;
}

/** The profile's own demat — the shape every existing reader already has. */
export interface DefaultDemat {
  depository: Depository;
  dpId: string;
  clientId: string;
}

/** An extra account as stored. `active: false` rows are retired and excluded. */
export interface ExtraDemat extends DefaultDemat {
  id: string;
  label?: string | null;
  active?: boolean;
}

/** Normalised for comparison — a DP ID differs by spacing and case, not identity. */
const key = (d: { depository: string; dpId: string; clientId: string }): string =>
  `${String(d.depository).toUpperCase()}|${String(d.dpId).replace(/\s+/g, '').toUpperCase()}|${String(d.clientId).replace(/\s+/g, '').toUpperCase()}`;

/**
 * The full list for a profile: its default first, then its active extras.
 *
 * An extra that DUPLICATES the default is dropped rather than shown twice. No
 * cross-table constraint can express that — the unique index only covers the
 * extras among themselves — so the service refuses it on write and this drops it
 * on read, because a record that predates the check must not render the same
 * account twice in a picker.
 */
export function dematAccountsFor(
  profile: DefaultDemat | null | undefined,
  extras: ExtraDemat[] | null | undefined,
): DematAccountView[] {
  const out: DematAccountView[] = [];
  const seen = new Set<string>();
  /*
   * PRESENCE IS `clientId` ALONE — a CDSL account has NO DP ID.
   *
   * `profiles.service` stores `dpId: depository === 'NSDL' ? dpId : ''`, so a
   * blank DP ID is the normal, correct shape for every CDSL demat in the
   * database. Requiring both (which this did for its first hour, 2026-10-08)
   * dropped every CDSL account: a CDSL profile resolved to NO demat at all, and
   * `dematForApplication` then returned null, which the rail builder turns into
   * a thrown bid. All 230 profiles happened to be NSDL when it was caught, so
   * nothing was live — the first CDSL applicant would have been unable to apply.
   */
  if (profile?.clientId) {
    out.push({
      id: null,
      depository: profile.depository,
      dpId: profile.dpId,
      clientId: profile.clientId,
      label: null,
      isDefault: true,
    });
    seen.add(key(profile));
  }
  for (const e of extras ?? []) {
    if (e.active === false) continue;
    if (!e.clientId) continue;   // CDSL has no DP ID — see the note above
    const k = key(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      id: e.id,
      depository: e.depository,
      dpId: e.dpId,
      clientId: e.clientId,
      label: e.label ?? null,
      isDefault: false,
    });
  }
  return out;
}

/**
 * Which demat an application credits to.
 *
 * `dematAccountId` null — every application before 2026-10-08, and every one the
 * investor leaves on the default — resolves to the profile's own columns. This is
 * the ONE place that decision is made; the rail bid builder, the print engine and
 * every report must call it rather than reading `profile.dpId` directly, or a bid
 * goes to the exchange naming a demat the investor did not choose.
 */
export function dematForApplication(
  profile: DefaultDemat | null | undefined,
  extras: ExtraDemat[] | null | undefined,
  dematAccountId: string | null | undefined,
): DematAccountView | null {
  const list = dematAccountsFor(profile, extras);
  if (!list.length) return null;
  if (!dematAccountId) return list[0] ?? null;
  /* A chosen account that is no longer in the list — retired, or removed — must
     NOT silently fall back to the default: the bid would name a different demat
     than the investor picked. The caller decides what to do with null. */
  return list.find((d) => d.id === dematAccountId) ?? null;
}

/**
 * `NSDL IN301234 / 87654321`, or `CDSL 1208870011223344` — a CDSL account has
 * no DP ID, so printing the separator anyway leaves a gap where a missing
 * identifier appears to be.
 */
export function dematLabel(d: DematAccountView): string {
  const core = d.dpId ? `${d.depository} ${d.dpId} / ${d.clientId}` : `${d.depository} ${d.clientId}`;
  return d.label ? `${d.label} — ${core}` : core;
}
