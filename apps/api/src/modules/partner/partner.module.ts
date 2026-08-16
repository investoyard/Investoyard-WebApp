import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { ApplicationsModule } from '../applications/applications.module';
import { PartnerController, PartnerKeysAdminController, PartnerReportsAdminController } from './partner.controller';
import { PartnerService } from './partner.service';
import { PartnerApiKeyGuard } from './partner.guard';

/**
 * White-label Partner API (M2) — v1: the Print-PDF service.
 * Partners authenticate with a per-tenant API key and POST final, pre-computed
 * application data; we store it (PII vaulted, tenant-scoped) and return the
 * prefilled ASBA forms as one merged PDF. Key management lives in the admin
 * (Tenants → API access).
 */
@Module({
  imports: [ApplicationsModule, JwtModule.register({})],
  controllers: [PartnerController, PartnerKeysAdminController, PartnerReportsAdminController],
  providers: [PartnerService, PartnerApiKeyGuard, PrismaService, PiiVaultService, JwtAuthGuard, PermissionsGuard],
})
export class PartnerModule {}
