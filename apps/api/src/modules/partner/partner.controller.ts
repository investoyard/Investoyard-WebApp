import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { PartnerApiKeyGuard } from './partner.guard';
import { PartnerService } from './partner.service';
import { CreatePartnerKeyDto, PartnerPrintFormsDto } from './partner.dto';

/** Public partner API (API-key auth) — v1. */
@Controller('partner/v1')
@UseGuards(PartnerApiKeyGuard)
export class PartnerController {
  constructor(private readonly partner: PartnerService) {}

  /**
   * POST /partner/v1/print-forms — store the partner's FINAL application data
   * and return the prefilled ASBA form(s) as one merged base64 PDF.
   */
  @Post('print-forms')
  printForms(@Req() req: any, @Body() dto: PartnerPrintFormsDto) {
    return this.partner.printFormsLogged(req.partnerTenant, req.partnerKeyId, dto);
  }

  /* ── Read surface ────────────────────────────────────────────────────────
     Every response is projected through the operational contract, so adding a
     reporting field can never change what a partner receives. See
     packages/shared-types/src/operationalContract.ts.                        */

  /** GET /partner/v1/ipos?board=&instrument=&status=&limit=&offset= */
  @Get('ipos')
  listIpos(@Query() q: any) {
    return this.partner.listIpos({
      board: q.board, instrument: q.instrument, status: q.status,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  }

  /** GET /partner/v1/ipos/:symbol */
  @Get('ipos/:symbol')
  getIpo(@Param('symbol') symbol: string) {
    return this.partner.getIpo(symbol);
  }

  /** GET /partner/v1/ipos/:symbol/subscription */
  @Get('ipos/:symbol/subscription')
  getSubscription(@Param('symbol') symbol: string) {
    return this.partner.getSubscription(symbol);
  }

  /** GET /partner/v1/ipos/:symbol/gmp — tenant-gated, disclaimer included. */
  @Get('ipos/:symbol/gmp')
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
  @RequirePermissions('reports.view')
  calls(@Query() q: any) {
    return this.partner.callsReport({
      tenantId: q.tenantId || undefined,
      days: q.days ? Number(q.days) : undefined,
      page: q.page ? Number(q.page) : undefined,
      per: q.per ? Number(q.per) : undefined,
    });
  }

  @Get('prints')
  @RequirePermissions('reports.view')
  prints(@Query() q: any) {
    return this.partner.printsReport({
      tenantId: q.tenantId || undefined,
      days: q.days ? Number(q.days) : undefined,
      page: q.page ? Number(q.page) : undefined,
      per: q.per ? Number(q.per) : undefined,
    });
  }

  @Get('prints/export')
  @RequirePermissions('reports.view')
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

/** Admin key management (Tenants → API access panel). */
@Controller('admin/partner-keys')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PartnerKeysAdminController {
  constructor(private readonly partner: PartnerService) {}

  @Get(':tenantId')
  @RequirePermissions('tenants.manage')
  list(@Param('tenantId') tenantId: string) {
    return this.partner.listKeys(tenantId);
  }

  @Post(':tenantId')
  @RequirePermissions('tenants.manage')
  create(@Param('tenantId') tenantId: string, @Body() dto: CreatePartnerKeyDto) {
    return this.partner.createKey(tenantId, dto.label);
  }

  @Delete(':id')
  @RequirePermissions('tenants.manage')
  revoke(@Param('id') id: string) {
    return this.partner.revokeKey(id);
  }
}
