import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { tenantContext } from '../../common/tenant-context';
import { CreateProfileDto } from './profiles.dto';

@Injectable()
export class ProfilesService {
  constructor(private prisma: PrismaService, private vault: PiiVaultService) {}

  async list(userId: string) {
    const rows = await this.prisma.investorProfile.findMany({ where: { userId } });
    return Promise.all(rows.map((p) => this.toView(p)));
  }

  async create(userId: string, dto: CreateProfileDto) {
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
          relationship: dto.relationship,
          fullName: dto.fullName,
          panTokenRef,
          panHash: this.vault.hash(dto.pan), // self-PAN: unique per tenant
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          depository: dto.depository,
          dpId: dto.dpId,
          clientId: dto.clientId,
          bankTokenRef,
          ifsc: dto.ifsc,
          upiTokenRef,
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

  async remove(userId: string, id: string) {
    const found = await this.prisma.investorProfile.findFirst({ where: { id, userId } });
    if (!found) throw new NotFoundException();
    await this.prisma.investorProfile.delete({ where: { id } });
  }

  /** masked view — never returns raw PII */
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
    };
  }
}
