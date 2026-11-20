import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { PartnerApiKeyGuard } from './partner.guard';
import { PartnerScopeGuard, RequireScope } from './partner-scope';
import { PartnerService } from './partner.service';
import { CreatePartnerKeyDto, PartnerPrintFormsDto, UpdatePartnerKeyScopesDto } from './partner.dto';
import { PartnerCallLogInterceptor } from './partner-call-log.interceptor';

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
@UseInterceptors(PartnerCallLogInterceptor)
export class PartnerController {
  constructor(private readonly partner: PartnerService) {}

  /**
   * POST /partner/v1/print-forms — store the partner's FINAL application data
   * and return the prefilled ASBA form(s) as one merged base64 PDF.
   */
  @Post('print-forms')
  @RequireScope('print-forms')
  printForms(@Req() req: any, @Body() dto: PartnerPrintFormsDto) {
    return this.partner.printForms(req.partnerTenant, req.partnerKeyId, dto);
  }

  /* ── The partner's own records (Phase 1, 2026-11-20) ──────────────────────
     Literal paths with the reference in a QUERY PARAMETER, never
     `prints/<uuid>`: that shape was intercepted upstream once (the admin
     Print-report View modal), and a partner integration should not depend on
     whichever proxy sits in front of us this year.                          */

  /** GET /partner/v1/prints?ipoSymbol=&batchId=&from=&to=&page=&per= */
  @Get('prints')
  @RequireScope('prints:read')
  listPrints(@Req() req: any, @Query() q: any) {
    return this.partner.listPrints(req.partnerTenant, {
      ipoSymbol: q.ipoSymbol, batchId: q.batchId, from: q.from, to: q.to,
      page: q.page ? Number(q.page) : undefined, per: q.per ? Number(q.per) : undefined,
    });
  }

  /** GET /partner/v1/prints/detail?ref=<applicationRef> */
  @Get('prints/detail')
  @RequireScope('prints:read')
  printDetail(@Req() req: any, @Query('ref') ref: string) {
    return this.partner.printDetailForPartner(req.partnerTenant, ref);
  }

  /** GET /partner/v1/prints/pdf?ref=<applicationRef> — the same form again, same number. */
  @Get('prints/pdf')
  @RequireScope('prints:read')
  reprint(@Req() req: any, @Query('ref') ref: string) {
    return this.partner.reprintPdf(req.partnerTenant, req.partnerKeyId, ref);
  }

  /** GET /partner/v1/allotment?ipoSymbol=&page=&per=  or  ?ref=<applicationRef> */
  @Get('allotment')
  @RequireScope('allotment:read')
  allotment(@Req() req: any, @Query() q: any) {
    return this.partner.allotmentForPartner(req.partnerTenant, {
      ipoSymbol: q.ipoSymbol, ref: q.ref,
      page: q.page ? Number(q.page) : undefined, per: q.per ? Number(q.per) : undefined,
    });
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
  @RequirePermissions('partner-api.calls.view')
  calls(@Query() q: any) {
    return this.partner.callsReport({
      tenantId: q.tenantId || undefined,
      days: q.days ? Number(q.days) : undefined,
      page: q.page ? Number(q.page) : undefined,
      per: q.per ? Number(q.per) : undefined,
    });
  }

  @Get('calls-summary')
  @RequirePermissions('partner-api.calls.view')
  callsSummary(@Query() q: any) {
    return this.partner.callsSummary({
      tenantId: q.tenantId || undefined,
      days: q.days ? Number(q.days) : undefined,
      by: q.by || undefined,
    });
  }

  @Get('calls-summary/export')
  @RequirePermissions('partner-api.calls.view')
  async callsSummaryCsv(@Query() q: any, @Res() res: any) {
    const by = ['partner', 'day', 'month', 'ipo'].includes(q.by) ? q.by : 'day';
    const csv = await this.partner.callsSummaryCsv({
      tenantId: q.tenantId || undefined,
      days: q.days ? Number(q.days) : undefined,
      by,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="partner-calls-${by}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @Get('prints')
  @RequirePermissions('partner-api.prints.view')
  prints(@Query() q: any) {
    return this.partner.printsReport({
      tenantId: q.tenantId || undefined,
      days: q.days ? Number(q.days) : undefined,
      page: q.page ? Number(q.page) : undefined,
      per: q.per ? Number(q.per) : undefined,
    });
  }

  @Get('prints/export')
  @RequirePermissions('partner-api.prints.view')
  async printsCsv(@Query() q: any, @Res() res: any) {
    const csv = await this.partner.printsReportCsv({
      tenantId: q.tenantId || undefined,
      days: q.days ? Number(q.days) : undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="partner-prints-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  /**
   * Dry-run of POST /partner/v1/print-forms — powers the Test button on the
   * Partner API docs page. No API key required (uses the operator's session);
   * no rows are persisted; form numbers are not consumed.
   */
  @Post('test-print')
  @RequirePermissions('partner-api.prints.view')
  testPrint(@Req() req: any, @Body() dto: PartnerPrintFormsDto) {
    return this.partner.previewForms({ sub: req.user?.sub, username: req.user?.username }, dto);
  }

  /**
   * Full request-side detail for one API-printed application, for the View
   * modal in the Print report. Scope-checked in the service — a partner
   * cannot fetch another tenant's record.
   *
   * URL is `print-detail?id=<uuid>` rather than `prints/<uuid>` because a
   * UUID-in-path pattern was being intercepted upstream (Cloudflare cache /
   * WAF rule) and returning 404 before the request reached iisnode. Moving
   * the id to a query parameter on a distinct path avoids the intercept.
   */
  @Get('print-detail')
  @RequirePermissions('partner-api.prints.view')
  printDetail(@Query('id') id: string) {
    return this.partner.printDetail(id);
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
    return this.partner.createKey(req.user.sub, tenantId, dto.label, dto.scopes);
  }

  /** What a key on this tenant may be given (the tenant's own scopes). */
  @Get(':tenantId/scope-options')
  scopeOptions(@Req() req: any, @Param('tenantId') tenantId: string) {
    return this.partner.keyScopeOptions(req.user.sub, tenantId);
  }

  /** Change an existing key's scopes; [] = everything its tenant has. */
  @Patch(':id/scopes')
  updateScopes(@Req() req: any, @Param('id') id: string, @Body() dto: UpdatePartnerKeyScopesDto) {
    return this.partner.updateKeyScopes(req.user.sub, id, dto.scopes);
  }

  @Delete(':id')
  revoke(@Req() req: any, @Param('id') id: string) {
    return this.partner.revokeKey(req.user.sub, id);
  }
}
