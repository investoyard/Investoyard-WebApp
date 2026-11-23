import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../common/require-permissions.decorator';
import { PartnerApiKeyGuard } from './partner.guard';
import { PartnerScopeGuard, RequireScope, partnerClientIp } from './partner-scope';
import { PartnerBidsService, type PartnerCtx } from './partner-bids.service';
import { PartnerWebhooksService } from './partner-webhooks.service';
import { SuperadminGuard } from '../../common/superadmin.guard';
import { PartnerService } from './partner.service';
import { PartnerTryService } from './partner-try.service';
import {
  CreatePartnerKeyDto, PartnerBidBatchDto, PartnerBidModifyDto, PartnerBidRefDto, PartnerBidUpiDto,
  PartnerApiAccessDto, PartnerBidLimitsDto, PartnerKeyIpAllowlistDto, PartnerPrintFormsDto, PartnerSimulateDto, PartnerWebhookDto, UpdatePartnerKeyScopesDto,
} from './partner.dto';
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
  constructor(private readonly partner: PartnerService, private readonly bids: PartnerBidsService) {}

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

  /* ── Bids (Phase 2, 2026-11-20) ───────────────────────────────────────────
     Every reference travels in the BODY or the QUERY, never the path. A test
     key's bids go to the simulator; live bidding is shut until Phase 3. */

  private ctx(req: any): PartnerCtx {
    return { tenant: req.partnerTenant, keyId: req.partnerKeyId, mode: req.partnerKeyMode === 'test' ? 'test' : 'live', ip: partnerClientIp(req) };
  }

  /** POST /partner/v1/bids — up to 25 bids, all or nothing. */
  @Post('bids')
  @RequireScope('bids:write')
  placeBids(@Req() req: any, @Body() dto: PartnerBidBatchDto) {
    return this.bids.place(this.ctx(req), req.partnerKeyIps ?? [], dto as any);
  }

  /** POST /partner/v1/bids/modify */
  @Post('bids/modify')
  @RequireScope('bids:write')
  modifyBid(@Req() req: any, @Body() dto: PartnerBidModifyDto) {
    return this.bids.modify(this.ctx(req), req.partnerKeyIps ?? [], dto as any);
  }

  /** POST /partner/v1/bids/cancel */
  @Post('bids/cancel')
  @RequireScope('bids:write')
  cancelBid(@Req() req: any, @Body() dto: PartnerBidRefDto) {
    return this.bids.cancel(this.ctx(req), req.partnerKeyIps ?? [], dto as any);
  }

  /** POST /partner/v1/bids/upi */
  @Post('bids/upi')
  @RequireScope('bids:write')
  changeBidUpi(@Req() req: any, @Body() dto: PartnerBidUpiDto) {
    return this.bids.changeUpi(this.ctx(req), req.partnerKeyIps ?? [], dto as any);
  }

  /** GET /partner/v1/bids?ref= | ?orderId= | ?ipoSymbol=&status=&page=&per= */
  @Get('bids')
  @RequireScope('bids:read')
  readBids(@Req() req: any, @Query() q: any) {
    return this.bids.read(this.ctx(req), req.partnerKeyIps ?? [], {
      ref: q.ref, orderId: q.orderId, ipoSymbol: q.ipoSymbol, status: q.status,
      page: q.page ? Number(q.page) : undefined, per: q.per ? Number(q.per) : undefined,
    });
  }

  /** GET /partner/v1/bids/limits — this account's live limits and what it has used today. */
  @Get('bids/limits')
  @RequireScope('bids:read')
  bidLimits(@Req() req: any) {
    return this.bids.limits(this.ctx(req));
  }

  /** GET /partner/v1/bids/summary?ipoSymbol= */
  @Get('bids/summary')
  @RequireScope('bids:read')
  bidSummary(@Req() req: any, @Query('ipoSymbol') ipoSymbol: string) {
    return this.bids.summary(this.ctx(req), req.partnerKeyIps ?? [], { ipoSymbol });
  }

  /** POST /partner/v1/test/simulate — test keys only. */
  @Post('test/simulate')
  @RequireScope('bids:write')
  simulate(@Req() req: any, @Body() dto: PartnerSimulateDto) {
    return this.bids.simulate(this.ctx(req), req.partnerKeyIps ?? [], dto as any);
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
  constructor(
    private readonly partner: PartnerService,
    private readonly bids: PartnerBidsService,
    private readonly hooks: PartnerWebhooksService,
    private readonly tryer: PartnerTryService,
  ) {}

  /**
   * The API Docs page: whose account it is showing, what that account may call,
   * and real values to prefill Try it with. A partner login sees its own; a
   * platform operator passes the partner it picked.
   */
  @Get('docs-context')
  @RequireAnyPermission('partner-api.keys.manage', 'partner-api.prints.view')
  async docsContext(@Req() req: any, @Query('tenantId') tenantId?: string) {
    return this.tryer.context(req.user.sub, await this.partner.reportScope(), tenantId);
  }

  /** Try it: run one Partner API endpoint as the signed-in partner, without a key. */
  @Post('try')
  @RequireAnyPermission('partner-api.keys.manage', 'partner-api.prints.view')
  async tryEndpoint(@Req() req: any, @Body() body: any) {
    return this.tryer.run(req.user.sub, await this.partner.reportScope(), {
      tenantId: body?.tenantId, endpoint: body?.endpoint, query: body?.query, body: body?.body,
    });
  }

  /** Partner bids (Phase 2) — operator sees every partner, a partner its own. */
  @Get('bids')
  @RequirePermissions('partner-api.prints.view')
  async bidsReport(@Query() q: any) {
    return this.bids.report(await this.partner.reportScope(), {
      tenantId: q.tenantId, mode: q.mode, status: q.status,
      days: q.days ? Number(q.days) : undefined, page: q.page ? Number(q.page) : undefined, per: q.per ? Number(q.per) : undefined,
    });
  }

  /** Webhook deliveries and their retries (Phase 2). */
  @Get('webhook-deliveries')
  @RequirePermissions('partner-api.calls.view')
  async deliveries(@Query() q: any) {
    return this.hooks.listDeliveries(await this.partner.reportScope(), {
      tenantId: q.tenantId, state: q.state,
      days: q.days ? Number(q.days) : undefined, page: q.page ? Number(q.page) : undefined, per: q.per ? Number(q.per) : undefined,
    });
  }

  @Post('webhook-deliveries/replay')
  @RequirePermissions('partner-api.calls.view')
  async replay(@Body('id') id: string) {
    return this.hooks.replay(await this.partner.reportScope(), String(id ?? ''));
  }


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
    return this.partner.createKey(req.user.sub, tenantId, dto.label, dto.scopes, dto.mode ?? 'live', dto.ipAllowlist);
  }

  /** What a key on this tenant may be given (the tenant's own scopes). */
  @Get(':tenantId/scope-options')
  scopeOptions(@Req() req: any, @Param('tenantId') tenantId: string) {
    return this.partner.keyScopeOptions(req.user.sub, tenantId);
  }

  /** The addresses a key may be used from; required before a live key can bid. */
  @Patch(':id/ip-allowlist')
  updateIps(@Req() req: any, @Param('id') id: string, @Body() dto: PartnerKeyIpAllowlistDto) {
    return this.partner.updateKeyIps(req.user.sub, id, dto.ipAllowlist);
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

/**
 * Partner webhook settings (Phase 2). Same access rule as API keys —
 * superadmin, or a member of that partner — enforced in the service.
 */
@Controller('admin/partner-webhook')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PartnerWebhookAdminController {
  constructor(private readonly hooks: PartnerWebhooksService) {}

  @Get(':tenantId')
  get(@Req() req: any, @Param('tenantId') tenantId: string) {
    return this.hooks.getConfig(req.user.sub, tenantId);
  }

  /** Set the URL. The secret is created on the first call and returned once. */
  @Put(':tenantId')
  set(@Req() req: any, @Param('tenantId') tenantId: string, @Body() dto: PartnerWebhookDto) {
    return this.hooks.setConfig(req.user.sub, tenantId, dto);
  }

  @Post(':tenantId/rotate')
  rotate(@Req() req: any, @Param('tenantId') tenantId: string) {
    return this.hooks.rotate(req.user.sub, tenantId);
  }

  @Post(':tenantId/ping')
  ping(@Req() req: any, @Param('tenantId') tenantId: string) {
    return this.hooks.ping(req.user.sub, tenantId);
  }
}

/**
 * A partner's LIVE bidding limits (Phase 3 pilot). Platform operators only:
 * this is the switch that lets a partner send real bids under our membership,
 * so no partner — not even for itself — may change it.
 */
@Controller('admin/partner-bid-limits')
@UseGuards(JwtAuthGuard, SuperadminGuard)
export class PartnerBidLimitsAdminController {
  constructor(private readonly bids: PartnerBidsService) {}

  @Get(':tenantId')
  get(@Param('tenantId') tenantId: string) {
    return this.bids.adminLimits(tenantId);
  }

  @Put(':tenantId')
  set(@Req() req: any, @Param('tenantId') tenantId: string, @Body() dto: PartnerBidLimitsDto) {
    return this.bids.setAdminLimits(req.user.sub, tenantId, dto);
  }
}

/**
 * Which partners may use the API at all, and which API groups (2026-11-23).
 * Platform operators only: switching a partner's API on is a decision about
 * who may act through our platform, so no partner may change it for itself.
 */
@Controller('admin/partner-api-access')
@UseGuards(JwtAuthGuard, SuperadminGuard)
export class PartnerAccessAdminController {
  constructor(private readonly partner: PartnerService) {}

  @Get()
  list() {
    return this.partner.accessOverview();
  }

  @Patch(':tenantId')
  set(@Req() req: any, @Param('tenantId') tenantId: string, @Body() dto: PartnerApiAccessDto) {
    return this.partner.setAccess(req.user.sub, tenantId, dto);
  }
}
