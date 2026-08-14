import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { tenantContext } from '../../common/tenant-context';
import { CreateProfileDto, UpdateProfileDto } from './profiles.dto';

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

  /** A UPI ID is accepted only when its handle is on the admin-managed master. */
  private async assertUpiAllowed(upiId: string) {
    const m = /^[a-zA-Z0-9.\-_]{2,}@([a-zA-Z0-9]{2,})$/.exec(upiId.trim());
    if (!m) throw new BadRequestException('Enter the UPI ID as name@handle (e.g. name@okaxis).');
    const allowed = await this.upiHandles();
    if (allowed.length && !allowed.includes(m[1].toLowerCase())) {
      throw new BadRequestException(`'@${m[1]}' is not a supported UPI handle.`);
    }
  }

  async list(userId: string) {
    // Deactivated profiles are hidden everywhere; their applications keep history.
    const rows = await this.prisma.investorProfile.findMany({
      where: { userId, active: true },
      include: { _count: { select: { applications: true } } },
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
    const dpId = String(dto.dpId ?? '').trim().toUpperCase();
    const clientId = String(dto.clientId ?? '').trim();
    if (dto.depository === 'NSDL') {
      if (!/^IN\d{6}$/.test(dpId)) throw new BadRequestException('NSDL DP ID must be IN followed by 6 digits (e.g. IN301234).');
      if (!/^\d{8}$/.test(clientId)) throw new BadRequestException('NSDL Client ID must be exactly 8 digits.');
    } else {
      if (!/^\d{16}$/.test(clientId)) throw new BadRequestException('CDSL demat number must be exactly 16 digits.');
    }
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
      include: { _count: { select: { applications: true } } },
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
    const depository = dto.depository ?? (existing.depository as any);
    const dpId = String(dto.dpId ?? existing.dpId ?? '').trim().toUpperCase();
    const clientId = String(dto.clientId ?? existing.clientId ?? '').trim();
    if (depository === 'NSDL') {
      if (!/^IN\d{6}$/.test(dpId)) throw new BadRequestException('NSDL DP ID must be IN followed by 6 digits (e.g. IN301234).');
      if (!/^\d{8}$/.test(clientId)) throw new BadRequestException('NSDL Client ID must be exactly 8 digits.');
    } else if (!/^\d{16}$/.test(clientId)) {
      throw new BadRequestException('CDSL demat number must be exactly 16 digits.');
    }
    data.depository = depository;
    data.dpId = depository === 'NSDL' ? dpId : '';
    data.clientId = clientId;

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
      include: { _count: { select: { applications: true } } },
    });
    if (!found) throw new NotFoundException();
    if (found._count.applications > 0) {
      await this.prisma.investorProfile.update({ where: { id }, data: { active: false } });
      return { deactivated: true };
    }
    await this.prisma.investorProfile.delete({ where: { id } });
    return { deleted: true };
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
