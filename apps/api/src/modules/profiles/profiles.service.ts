import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { tenantContext } from '../../common/tenant-context';
import { CreateProfileDto, UpdateProfileDto } from './profiles.dto';
import { dematAccountsFor } from '@investoyard/shared-types';

/** Seeded on first use; the admin manages the list afterwards (Masters → UPI Handles). */
const DEFAULT_UPI_HANDLES = [
  'okaxis', 'oksbi', 'okhdfcbank', 'okicici', 'ybl', 'ibl', 'axl', 'apl', 'yapl',
  'paytm', 'ptyes', 'ptaxis', 'pthdfc', 'ptsbi', 'upi', 'axisb', 'idfcbank', 'kotak',
].map((name, i) => ({ name, sortOrder: i + 1 }));

/** Seeded on first use; the admin manages the list afterwards (Masters → Relationships). */
const DEFAULT_RELATIONSHIPS = [
  { name: 'Self', allowMultiple: false, sortOrder: 1 },
  { name: 'Spouse', allowMultiple: false, sortOrder: 2 },
  { name: 'Mother', allowMultiple: false, sortOrder: 3 },
  { name: 'Father', allowMultiple: false, sortOrder: 4 },
  { name: 'Child', allowMultiple: true, sortOrder: 5 },
  { name: 'Sibling', allowMultiple: true, sortOrder: 6 },
  { name: 'Other', allowMultiple: true, sortOrder: 7 },
  { name: 'Parent', allowMultiple: false, sortOrder: 8, active: false }, // legacy rows only
];

@Injectable()
export class ProfilesService {
  constructor(private prisma: PrismaService, private vault: PiiVaultService) {}

  /** All relationship master rows, seeding the defaults if the table is empty. */
  private async relationshipRows() {
    let rows = await this.prisma.relationshipMaster.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    if (!rows.length) {
      await this.prisma.relationshipMaster.createMany({ data: DEFAULT_RELATIONSHIPS, skipDuplicates: true });
      rows = await this.prisma.relationshipMaster.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    }
    return rows;
  }

  /** Public: active relationship options for the add-applicant form. */
  async relationships() {
    const rows = await this.relationshipRows();
    return rows.filter((r) => r.active).map((r) => ({ name: r.name, allowMultiple: r.allowMultiple }));
  }

  /** All UPI-handle master rows, seeding the common defaults if the table is empty. */
  private async upiHandleRows() {
    let rows = await this.prisma.upiHandleMaster.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    if (!rows.length) {
      await this.prisma.upiHandleMaster.createMany({ data: DEFAULT_UPI_HANDLES, skipDuplicates: true });
      rows = await this.prisma.upiHandleMaster.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    }
    return rows;
  }

  /** Public: active UPI handles (the part after '@') for UPI-ID entry validation. */
  async upiHandles() {
    return (await this.upiHandleRows()).filter((r) => r.active).map((r) => r.name);
  }

/* ------------------------------------------------------------------ *
   *  Bank / branch / pincode reference data (Phase 3)
   *
   *  PUBLIC, like `relationships()` and `upiHandles()` above and for the same
   *  reason: it is a published directory, not anybody's data. Nothing here
   *  reads or returns a profile.
   * ------------------------------------------------------------------ */

  /** Every bank that has at least one branch, for the first picker. ~170 rows. */
  /**
   * The bank picker's options — sir's point 7, "bank master shown on indian
   * bank, not out of India bank".
   *
   * IT WAS AN ORDERING PROBLEM, NOT A CONTENTS PROBLEM, and that distinction
   * decided the fix. The directory is RBI's own IFSC list, so every bank in it
   * HAS Indian branches — including the foreign ones, which operate here
   * (AB Bank, Citi, Standard Chartered, DBS India are real ASBA banks and an
   * applicant who banks with one has to be enterable). Removing anything would
   * have made a valid application impossible to fill in.
   *
   * What the operator was actually looking at: ordered by name, the first twelve
   * options were an army credit co-operative and eleven district co-operative
   * banks, while STATE BANK OF INDIA sat at #1163 of 1348. Measured: 1,068 of
   * the 1,348 banks have exactly ONE branch, and 46 have over 500 — so an
   * alphabetical list is almost entirely the long tail, with everything anyone
   * banks with buried in it.
   *
   * TWO TIERS, because the two groups are reached differently. The banks people
   * use are reached by LOOKING — they have to be in the first screenful — so
   * they are ordered by branch count, biggest first. The tail is reached by
   * TYPING, where order does not matter, so it stays alphabetical and browsable.
   * A single size-ordered list would have left a co-operative bank's position
   * meaningless; a single alphabetical one is the bug.
   *
   * THE THRESHOLD IS CALIBRATED AGAINST THE DISTRIBUTION, not picked: 100
   * branches puts 72 banks in the first tier (46 over 500, 26 between 101 and
   * 500) and leaves a clean break — the next bucket down is 136 banks with
   * between 11 and 100.
   *
   * `major` is returned so the picker can draw a divider. Without it the
   * ordering looks arbitrary, which is its own kind of wrong.
   *
   * ONE GROUP BY rather than a count per bank: 1.7 lakh branch rows, and this
   * is on the critical path of the one screen an applicant cannot avoid.
   */
  async banks(): Promise<{ id: string; name: string; major: boolean }[]> {
    const MAJOR_MIN_BRANCHES = 100;
    const rows = await this.prisma.$queryRaw<{ id: string; name: string; n: number }[]>`
      SELECT b.id, b.name, COUNT(br.id)::int AS n
        FROM "BankMaster" b
        LEFT JOIN "BankBranch" br ON br."bankId" = b.id
       WHERE b.active = true
    GROUP BY b.id, b.name
    ORDER BY (COUNT(br.id) >= ${MAJOR_MIN_BRANCHES}) DESC,
             CASE WHEN COUNT(br.id) >= ${MAJOR_MIN_BRANCHES} THEN COUNT(br.id) END DESC,
             lower(b.name) ASC`;
    return rows.map((r) => ({ id: r.id, name: r.name, major: Number(r.n) >= MAJOR_MIN_BRANCHES }));
  }

  /**
   * Branch search — ALWAYS scoped to one bank, paginated, and never a full list.
   *
   * THE SCOPING IS NOT A CONVENIENCE, IT IS WHAT MAKES THE SCREEN POSSIBLE.
   * There are ~1.7 lakh branches; the `(bankId, branch)` index exists for this
   * query and an unscoped search could not use it. `SearchSelect` loads every
   * option into memory, which is why this needed `AsyncSearchSelect` on the web
   * side rather than a bigger fetch.
   *
   * A PASTED IFSC IS ANSWERED EXACTLY AND WITHOUT A BANK, because someone who
   * has the code in front of them should not have to find their bank in a
   * dropdown first. It is checked before the name search and short-circuits:
   * an 11-character IFSC has exactly one answer, so returning a list of
   * near-misses would be noise.
   */
  async branches(opts: { bankId?: string; q?: string; take?: number }) {
    const q = (opts.q ?? '').trim();
    const take = Math.min(Math.max(Number(opts.take) || 20, 1), 50);

    /* An exact IFSC wins over everything, bank or no bank. */
    if (/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(q)) {
      const hit = await this.prisma.bankBranch.findUnique({
        where: { ifsc: q.toUpperCase() },
        select: { id: true, ifsc: true, branch: true, city: true, district: true, state: true, bank: { select: { id: true, name: true } } },
      });
      return hit ? [hit] : [];
    }

    /* Otherwise a bank is REQUIRED. Returning an empty list rather than
       throwing: the picker renders before a bank is chosen, and a 400 there
       would be an error the reader caused by doing nothing wrong. */
    if (!opts.bankId) return [];

    /* `contains` cannot use the btree, so it scans this bank's rows — a few
       thousand for most banks, ~22k for the largest. Measured after import
       rather than assumed; if it ever reads slow the fix is a trigram index,
       not a narrower search, because people search by the middle of a branch
       name ("fort", "andheri") far more than by its first word. */
    return this.prisma.bankBranch.findMany({
      where: {
        bankId: opts.bankId,
        active: true,
        ...(q ? { OR: [{ branch: { contains: q, mode: 'insensitive' } }, { city: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      select: { id: true, ifsc: true, branch: true, city: true, district: true, state: true, bank: { select: { id: true, name: true } } },
      orderBy: { branch: 'asc' },
      take,
    });
  }

  /**
   * States and union territories — a CLOSED list, so this one IS a dropdown.
   *
   * 36 rows, operator-editable, and seeded from the pincode directory so the
   * spellings match what the auto-fill puts in the field. Two corrections the
   * import cannot make for you: GeoNames omits LADAKH (a UT since 2019, still
   * filed under Jammu & Kashmir) and spells Puducherry the pre-2006
   * "Pondicherry". Both are why this is a table and not a derived list.
   */
  async states() {
    return this.prisma.stateMaster.findMany({
      where: { active: true },
      select: { name: true, code: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * City SUGGESTIONS — derived from the pincode directory, never a table.
   *
   * NOT A SEPARATE MASTER, and that is the design rather than a shortcut: a
   * `CityMaster` would be a second opinion about city names, and the moment it
   * drifted from `PincodeMaster` the dropdown would stop offering what the
   * pincode auto-fills. One source, so they cannot disagree. (Same reasoning as
   * the readiness card calling `offeredFromIpo()` rather than re-testing its
   * conditions.)
   *
   * AND IT SUGGESTS WITHOUT CONSTRAINING. The field still accepts a typed value
   * the directory has never heard of, because the registrar matches what the
   * applicant’s BANK holds, not what we imported — a closed list here could
   * make a valid application unfillable, which is the one failure worth
   * designing against. Contrast `states()` above, where the set really is closed.
   */
  async cities(opts: { q?: string; state?: string; take?: number }) {
    const q = (opts.q ?? '').trim();
    const take = Math.min(Math.max(Number(opts.take) || 20, 1), 50);
    const rows = await this.prisma.pincodeMaster.findMany({
      where: {
        active: true,
        city: q ? { contains: q, mode: 'insensitive' } : { not: null },
        ...(opts.state ? { state: opts.state } : {}),
      },
      select: { city: true, state: true },
      /* DISTINCT on the pair, because the same city name exists in more than
         one state and collapsing on city alone would hide one of them. */
      distinct: ['city', 'state'],
      orderBy: { city: 'asc' },
      take,
    });
    return rows.filter((r) => r.city).map((r) => ({ city: r.city as string, state: r.state }));
  }
  /**
   * Pincode → city + state.
   *
   * Returns `null` for an unknown pincode rather than throwing, because the
   * form calls this on every sixth keystroke and a 404 in the console on the
   * way to a valid pincode is noise. `ambiguous` rides along so the caller can
   * decide how much to trust it — the directory's own post offices disagreed on
   * those, and the form must not present a guess as a fact.
   */
  async pincode(pin: string) {
    const p = String(pin ?? '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(p)) return null;
    return this.prisma.pincodeMaster.findUnique({
      where: { pincode: p },
      select: { pincode: true, city: true, state: true, ambiguous: true },
    });
  }

  /** A UPI ID is accepted only when its handle is on the admin-managed master. */
  private async assertUpiAllowed(upiId: string) {
    const m = /^[a-zA-Z0-9.\-_]{2,}@([a-zA-Z0-9]{2,})$/.exec(upiId.trim());
    if (!m) throw new BadRequestException('Enter the UPI ID as name@handle (e.g. name@okaxis).');
    const allowed = await this.upiHandles();
    if (allowed.length && !allowed.includes(m[1].toLowerCase())) {
      throw new BadRequestException(`'@${m[1]}' is not a supported UPI handle.`);
    }
  }

  /**
   * Set just the UPI ID on one applicant.
   *
   * Public so the applications side can offer an on-the-spot change without
   * re-implementing the two rules that govern a UPI ID — the `name@handle`
   * shape and the admin-managed handle allow-list. `assertUpiAllowed` stays
   * private and this is the one way in; a second copy of that regex is exactly
   * how the two surfaces would start disagreeing about what a valid UPI is.
   */
  async setUpi(userId: string, profileId: string, upiId: string) {
    const existing = await this.prisma.investorProfile.findFirst({
      where: { id: profileId, userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('No such applicant.');
    await this.assertUpiAllowed(upiId);
    await this.prisma.investorProfile.update({
      where: { id: profileId },
      data: { upiTokenRef: await this.vault.tokenize(upiId) },
    });
  }

  async list(userId: string) {
    // Deactivated profiles are hidden everywhere; their applications keep history.
    const rows = await this.prisma.investorProfile.findMany({
      where: { userId, active: true },
      include: { _count: { select: { applications: true } }, dematAccounts: { where: { active: true }, orderBy: { createdAt: 'asc' } } },
    });
    return Promise.all(rows.map((p) => this.toView(p)));
  }

  async create(userId: string, dto: CreateProfileDto) {
    // Relationship must exist (and be active) in the admin-managed master; rows
    // with allowMultiple=false (self, spouse, mother, father, …) are one-per-account.
    const rel = String(dto.relationship ?? '').trim().toLowerCase();
    const master = (await this.relationshipRows()).find((r) => r.name.toLowerCase() === rel);
    if (!master || !master.active) throw new BadRequestException(`'${dto.relationship}' is not an allowed relationship.`);
    if (!master.allowMultiple) {
      const dup = await this.prisma.investorProfile.findFirst({
        where: { userId, relationship: rel },
        select: { id: true },
      });
      if (dup) throw new ConflictException(`A '${master.name}' applicant already exists on this account.`);
    }
    // Depository-specific demat rules: NSDL DP ID = IN + 6 digits with an 8-digit
    // client id; CDSL has NO separate DP ID — one 16-digit demat number.
    const { dpId, clientId } = this.normaliseDemat(dto.depository, dto.dpId, dto.clientId);
    if (dto.upiId) await this.assertUpiAllowed(dto.upiId);
    try {
      // Envelope-encrypt PII up front (vault ops are async — KMS in prod).
      const [panTokenRef, bankTokenRef, upiTokenRef] = await Promise.all([
        this.vault.tokenize(dto.pan),
        dto.bankAccount ? this.vault.tokenize(dto.bankAccount) : Promise.resolve(null),
        dto.upiId ? this.vault.tokenize(dto.upiId) : Promise.resolve(null),
      ]);
      const created = await this.prisma.investorProfile.create({
        data: {
          tenantId: tenantContext.requireTenantId(),
          userId,
          relationship: rel, // stored lowercase for stable matching/i18n keys
          fullName: dto.fullName,
          panTokenRef,
          panHash: this.vault.hash(dto.pan), // self-PAN: unique per tenant
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          depository: dto.depository,
          dpId: dto.depository === 'NSDL' ? dpId : '', // CDSL: intentionally blank
          clientId,
          bankTokenRef,
          ifsc: dto.ifsc,
          upiTokenRef,
          bankName: dto.bankName || null,
          branchName: dto.branchName || null,
          address: dto.address || null,
          city: dto.city || null,
          state: dto.state || null,
          pincode: dto.pincode || null,
          email: dto.email || null,
          mobile: dto.mobile || null,
        },
      });
      // NOTE: persisting data_sharing_rail consent happens in the apply flow / consent module.
      return this.toView(created);
    } catch (e: any) {
      // @@unique([tenantId, panHash]) — a PAN can back only one profile per tenant.
      if (e?.code === 'P2002') throw new ConflictException('This PAN is already registered on this platform.');
      throw e;
    }
  }

  /**
   * Edit an applicant. Omitted fields keep their values; PAN / bank / UPI are
   * replaced only when a non-empty value is sent (they're vaulted, never echoed).
   * PAN is locked once the applicant has any application (self-PAN integrity).
   */
  async update(userId: string, id: string, dto: UpdateProfileDto) {
    const existing = await this.prisma.investorProfile.findFirst({
      where: { id, userId, active: true },
      include: { _count: { select: { applications: true } }, dematAccounts: { where: { active: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!existing) throw new NotFoundException();
    const data: Record<string, any> = {};

    // Relationship change — validate against the master incl. one-per-account rule.
    if (dto.relationship !== undefined) {
      const rel = String(dto.relationship).trim().toLowerCase();
      if (rel !== existing.relationship) {
        const master = (await this.relationshipRows()).find((r) => r.name.toLowerCase() === rel);
        if (!master || !master.active) throw new BadRequestException(`'${dto.relationship}' is not an allowed relationship.`);
        if (!master.allowMultiple) {
          const dup = await this.prisma.investorProfile.findFirst({ where: { userId, relationship: rel, active: true, id: { not: id } }, select: { id: true } });
          if (dup) throw new ConflictException(`A '${master.name}' applicant already exists on this account.`);
        }
        data.relationship = rel;
      }
    }

    // Demat — validate the RESULTING combination (provided values over current).
    const resolved = this.normaliseDemat(
      dto.depository ?? (existing.depository as any),
      dto.dpId ?? existing.dpId ?? '',
      dto.clientId ?? existing.clientId ?? '',
    );
    data.depository = resolved.depository;
    data.dpId = resolved.dpId;
    data.clientId = resolved.clientId;

    // PAN — replace only when typed; locked once applications exist.
    if (dto.pan) {
      const samePan = this.vault.hash(dto.pan) === existing.panHash;
      if (!samePan) {
        if (existing._count.applications > 0) throw new BadRequestException('PAN cannot be changed once this applicant has an application.');
        data.panTokenRef = await this.vault.tokenize(dto.pan);
        data.panHash = this.vault.hash(dto.pan);
        data.kycStatus = 'unverified'; // new PAN → verification starts over
      }
    }
    if (dto.bankAccount) data.bankTokenRef = await this.vault.tokenize(dto.bankAccount);
    if (dto.upiId) {
      await this.assertUpiAllowed(dto.upiId);
      data.upiTokenRef = await this.vault.tokenize(dto.upiId);
    }

    if (dto.fullName !== undefined && dto.fullName.trim()) data.fullName = dto.fullName.trim();
    if (dto.dateOfBirth !== undefined) data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dto.ifsc !== undefined) data.ifsc = dto.ifsc || null;
    for (const k of ['bankName', 'branchName', 'address', 'city', 'state', 'pincode', 'email', 'mobile'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k] || null;
    }

    try {
      const updated = await this.prisma.investorProfile.update({ where: { id }, data });
      return this.toView({ ...updated, _count: existing._count });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('This PAN is already registered on this platform.');
      throw e;
    }
  }

  /**
   * Remove an applicant: hard-delete when they have no applications; otherwise
   * DEACTIVATE (hidden from lists/apply, history preserved — applications
   * reference the profile).
   */
  async remove(userId: string, id: string) {
    const found = await this.prisma.investorProfile.findFirst({
      where: { id, userId },
      include: { _count: { select: { applications: true } }, dematAccounts: { where: { active: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!found) throw new NotFoundException();
    if (found._count.applications > 0) {
      await this.prisma.investorProfile.update({ where: { id }, data: { active: false } });
      return { deactivated: true };
    }
    await this.prisma.investorProfile.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * NSDL / CDSL identifier rules — ONE copy.
   *
   * These were written out at `create` and again at `update`; the demat
   * endpoints below would have been a third, and three copies of a validation
   * rule is how an NSDL DP ID comes to be accepted in one place and rejected in
   * another. CDSL's `dpId` is deliberately blank — the 16-digit demat number is
   * the whole identifier.
   */
  private normaliseDemat(depository: string, dpIdIn?: string, clientIdIn?: string) {
    const dpId = String(dpIdIn ?? '').trim().toUpperCase();
    const clientId = String(clientIdIn ?? '').trim();
    if (depository === 'NSDL') {
      if (!/^IN\d{6}$/.test(dpId)) throw new BadRequestException('NSDL DP ID must be IN followed by 6 digits (e.g. IN301234).');
      if (!/^\d{8}$/.test(clientId)) throw new BadRequestException('NSDL Client ID must be exactly 8 digits.');
    } else {
      if (!/^\d{16}$/.test(clientId)) throw new BadRequestException('CDSL demat number must be exactly 16 digits.');
    }
    return { depository: depository as any, dpId: depository === 'NSDL' ? dpId : '', clientId };
  }

  /**
   * Add an ADDITIONAL demat to a profile (2026-10-08).
   *
   * The profile's own columns stay its default and are never written here — see
   * the DematAccount note in schema.prisma. This only adds somewhere else the
   * allotment can land; it cannot let anyone apply twice, because the self-PAN
   * rule keys on `panHash` per IPO per bucket and never looks at the demat.
   */
  async addDemat(userId: string, profileId: string, dto: { depository: string; dpId?: string; clientId: string; label?: string }) {
    const profile = await this.prisma.investorProfile.findFirst({
      where: { id: profileId, userId, active: true },
      select: { id: true, depository: true, dpId: true, clientId: true },
    });
    if (!profile) throw new NotFoundException();
    const d = this.normaliseDemat(dto.depository, dto.dpId, dto.clientId);

    /* Refused here because no constraint can express it: the unique index covers
       the extras among themselves, not the profile's own columns. Without this
       the picker would offer the same account twice, one of them labelled
       "default" — and `dematAccountsFor` would silently drop the duplicate,
       leaving the operator wondering where their new row went. */
    const sameAsDefault = profile.depository === d.depository
      && String(profile.dpId ?? '').toUpperCase() === d.dpId
      && String(profile.clientId ?? '') === d.clientId;
    if (sameAsDefault) throw new ConflictException('That is already this applicant’s default demat account.');

    try {
      await this.prisma.dematAccount.create({
        data: { profileId, depository: d.depository, dpId: d.dpId, clientId: d.clientId, label: dto.label?.trim() || null },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('That demat account is already on this applicant.');
      throw e;
    }
    return this.one(userId, profileId);
  }

  /**
   * Retire an additional demat. NEVER a hard delete: a submitted bid names its
   * demat to the exchange, and `Application.dematAccountId` is RESTRICT, so
   * removing the row would either fail or erase which account a real bid used.
   * Retired accounts drop out of every picker and keep their history.
   */
  async retireDemat(userId: string, profileId: string, dematId: string) {
    const found = await this.prisma.dematAccount.findFirst({
      where: { id: dematId, profileId, profile: { userId } },
      select: { id: true },
    });
    if (!found) throw new NotFoundException();
    await this.prisma.dematAccount.update({ where: { id: dematId }, data: { active: false } });
    return this.one(userId, profileId);
  }

  /** One profile, in the same masked shape as the list. */
  async one(userId: string, id: string) {
    const p = await this.prisma.investorProfile.findFirst({
      where: { id, userId },
      include: { _count: { select: { applications: true } }, dematAccounts: { where: { active: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!p) throw new NotFoundException();
    return this.toView(p);
  }

  /** masked view — never returns raw PII (PAN masked; bank/UPI as set-flags only) */
  private async toView(p: any) {
    return {
      id: p.id,
      relationship: p.relationship,
      fullName: p.fullName,
      pan: this.vault.mask(await this.vault.resolve(p.panTokenRef)),
      depository: p.depository,
      dpId: p.dpId,
      clientId: p.clientId,
      /* EVERY demat, default first. Built here rather than on each client so
         the join between the profile's own columns and its extra rows happens
         once — see dematAccountsFor(). */
      demats: dematAccountsFor(p, p.dematAccounts ?? []),
      ifsc: p.ifsc,
      hasUpi: !!p.upiTokenRef,
      hasBank: !!p.bankTokenRef,
      kycStatus: p.kycStatus,
      // contact/bank prefill fields (not vaulted) — the edit form shows these
      bankName: p.bankName ?? undefined,
      branchName: p.branchName ?? undefined,
      address: p.address ?? undefined,
      city: p.city ?? undefined,
      state: p.state ?? undefined,
      pincode: p.pincode ?? undefined,
      email: p.email ?? undefined,
      mobile: p.mobile ?? undefined,
      /** PAN edits are locked once any application exists */
      hasApplications: (p._count?.applications ?? 0) > 0,
    };
  }
}
