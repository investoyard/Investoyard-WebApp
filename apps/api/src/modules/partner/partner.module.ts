import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { ApplicationsModule } from '../applications/applications.module';
import { RailModule } from '../rail/rail.module';
import { PartnerBidsService } from './partner-bids.service';
import { PartnerWebhooksService } from './partner-webhooks.service';
import {
  PartnerBidLimitsAdminController, PartnerController, PartnerKeysAdminController, PartnerReportsAdminController, PartnerWebhookAdminController,
} from './partner.controller';
import { SuperadminGuard } from '../../common/superadmin.guard';
import { PartnerService } from './partner.service';
import { PartnerApiKeyGuard } from './partner.guard';
import { PartnerScopeGuard } from './partner-scope';
import { PartnerCallLogInterceptor } from './partner-call-log.interceptor';

/**
 * White-label Partner API (M2) — v1: the Print-PDF service.
 * Partners authenticate with a per-tenant API key and POST final, pre-computed
 * application data; we store it (PII vaulted, tenant-scoped) and return the
 * prefilled ASBA forms as one merged PDF. Key management lives in the admin
 * (Tenants → API access).
 */
@Module({
  imports: [ApplicationsModule, RailModule, JwtModule.register({})],
  controllers: [PartnerController, PartnerKeysAdminController, PartnerReportsAdminController, PartnerWebhookAdminController, PartnerBidLimitsAdminController],
  providers: [PartnerService, PartnerBidsService, PartnerWebhooksService, SuperadminGuard, PartnerApiKeyGuard, PartnerScopeGuard, PartnerCallLogInterceptor, PrismaService, PiiVaultService, JwtAuthGuard, PermissionsGuard],
})
export class PartnerModule {}
