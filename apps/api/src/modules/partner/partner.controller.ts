import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { PartnerApiKeyGuard } from './partner.guard';
import { PartnerScopeGuard, RequireScope } from './partner-scope';
import { PartnerService } from './partner.service';
import { CreatePartnerKeyDto, PartnerPrintFormsDto } from './partner.dto';

/**
 * Public partner API (API-key auth) — v1.
 *
 * Guard order matters: PartnerApiKeyGuard first (resolves the tenant),
 * PartnerScopeGuard second (reads the tenant's scopes and 403s if the
 * endpoint's @RequireScope is not in the list). Every endpoint below is
 * scoped; a route without a @RequireScope tag is a bug and the scope
 * guard is silent about it — enforcement lives in code review.
 */
@Controller('partner/v1')
@UseGuards(PartnerApiKeyGuard, PartnerScopeGuard)
export class PartnerController {
  constructor(private readonly partner: PartnerService) {}

  /**
   * POST /partner/v1/print-forms — store the partner's FINAL application data
   * and return the prefilled ASBA form(s) as one merged base64 PDF.
   */
  @Post('print-forms')
  @RequireScope('print-forms')
  printForms(@Req() req: any, @Body() dto: PartnerPrintFormsDto) {
    return this.partner.printFormsLogged(req.partnerTenant, req.partnerKeyId, dto);
  }

  /* ── Read surface ────────────────────────────────────────────────────────
     Every response is projected through the operational contract, so adding a
     reporting field can never change what a partner receives. See
     packages/shared-types/src/operationalContract.ts.                        */

  /** GET /partner/v1/ipos?board=&instrument=&status=&limit=&offset= */
  @Get('ipos')
  @RequireScope('ipos:read')
  listIpos(@Query() q: any) {
    return this.partner.listIpos({
      board: q.board, instrument: q.instrument, status: q.status,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  }

  /** GET /partner/v1/ipos/:symbol */
  @Get('ipos/:symbol')
  @RequireScope('ipos:read')
  getIpo(@Param('symbol') symbol: string) {
    return this.partner.getIpo(symbol);
  }

  /** GET /partner/v1/ipos/:symbol/subscription — off by default; opt-in per tenant. */
  @Get('ipos/:symbol/subscription')
  @RequireScope('subscription:read')
  getSubscription(@Param('symbol') symbol: string) {
    return this.partner.getSubscription(symbol);
  }

  /** GET /partner/v1/ipos/:symbol/gmp — off by default; opt-in per tenant.
   *  Response still carries the SEBI-mandated disclaimer text when it returns
   *  a value, and the service's own tenant-level gmpEnabled check remains
   *  in force as a secondary gate. */
  @Get('ipos/:symbol/gmp')
  @RequireScope('gmp:read')
  getGmp(@Req() req: any, @Param('symbol') symbol: string) {
    return this.partner.getGmp(req.partnerTenant, symbol);
  }
}

/**
 * Admin reports — platform operators see every partner; partner operators are
 * auto-scoped to their own tenant (both hold `reports.view`).
 */
@Controller('admin/partner-api')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PartnerReportsAdminController {
  constructor(private readonly partner: PartnerService) {}

  @Get('calls')
  @RequirePermissions('partner-api.reports.view')
  calls(@Query() q: any) {
    return this.partner.callsReport({
      tenantId: q.tenantId || undefined,
      days: q.days ? Number(q.days) : undefined,
      page: q.page ? Number(q.page) : undefined,
      per: q.per ? Number(q.per) : undefined,
    });
  }

  @Get('prints')
  @RequirePermissions('partner-api.reports.view')
  prints(@Query() q: any) {
    return this.partner.printsReport({
      tenantId: q.tenantId || undefined,
      days: q.days ? Number(q.days) : undefined,
      page: q.page ? Number(q.page) : undefined,
      per: q.per ? Number(q.per) : undefined,
    });
  }

  @Get('prints/export')
  @RequirePermissions('partner-api.reports.view')
  async printsCsv(@Query() q: any, @Res() res: any) {
    const csv = await this.partner.printsReportCsv({
      tenantId: q.tenantId || undefined,
      days: q.days ? Number(q.days) : undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="partner-prints-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }
}

/**
 * Admin key management. Reachable both from Tenants → API access (platform
 * operators) and from Partner API → My API Keys (a partner admin on their
 * own tenant). Server-side scope is enforced in the service — the caller
 * must be superadmin OR hold a membership on the target tenant. Removing
 * the `tenants.manage` gate here is deliberate: it used to be the only
 * door to a partner's own keys, but that permission also opened the
 * platform tenant tree, which a partner should not see.
 */
@Controller('admin/partner-keys')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PartnerKeysAdminController {
  constructor(private readonly partner: PartnerService) {}

  @Get(':tenantId')
  list(@Req() req: any, @Param('tenantId') tenantId: string) {
    return this.partner.listKeys(req.user.sub, tenantId);
  }

  @Post(':tenantId')
  create(@Req() req: any, @Param('tenantId') tenantId: string, @Body() dto: CreatePartnerKeyDto) {
    return this.partner.createKey(req.user.sub, tenantId, dto.label);
  }

  @Delete(':id')
  revoke(@Req() req: any, @Param('id') id: string) {
    return this.partner.revokeKey(req.user.sub, id);
  }
}
