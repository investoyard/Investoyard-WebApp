import { Body, Controller, Get, Module, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { BiddingReportService, BiddingReportQuery } from './bidding-report.service';
import { BiddingSummaryService, BiddingSummaryQuery } from './bidding-summary.service';
import { BiddingRefreshService } from './bidding-refresh.service';
import { RailModule } from '../rail/rail.module';
import { BidOperationsService } from '../rail/bid-operations.service';

/** A revision carries the new quantity, and a price only when off cut-off. */
class EditBidDto {
  @IsInt() @Min(1) qty!: number;
  @IsOptional() @IsNumber() price?: number;
}

/** Rebid — same shape as Edit but both fields are optional. Missing qty/price
 *  means "keep the current values" (queueRebid handles the defaulting). */
class RebidDto {
  @IsOptional() @IsInt() @Min(1) qty?: number;
  @IsOptional() @IsNumber() price?: number;
}

/**
 * Bidding Report — the operator's view of every bid, and the actions on it.
 *
 * The reads live in BiddingReportService and the writes in
 * BidOperationsService; this controller only routes between them. That split is
 * deliberate: the ICDR rules and the ledger belong to one owner, and a report
 * that could also decide who may cancel would be a second place for those rules
 * to live. They would drift.
 *
 * Refresh UPI Status lives here as of Phase 3 — pulls one bid's status
 * from the exchange and folds it through the same PrismaApplicationRepo
 * update path the push callbacks use, so pull and push writes produce
 * identical rows.
 *
 * Rebid lives here as of Phase 4 — cancel + create in one transaction
 * via BidOperationsService.queueRebid. Same ICDR direction rule as
 * cancel; the endpoint just routes.
 *
 * Bidding Summary (the ledger matrix) also lives here — its own
 * read-only service, same permission as the report.
 *
 * Self-contained module rather than a controller bolted onto RailModule: this
 * needs the JWT and permissions guards, RailModule provides neither, and a
 * controller whose guard cannot be resolved takes down every route in the app
 * at boot rather than just its own.
 */
@Controller('admin/bidding')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BiddingController {
  constructor(
    private readonly report: BiddingReportService,
    private readonly ops: BidOperationsService,
    private readonly summary: BiddingSummaryService,
    private readonly refreshSvc: BiddingRefreshService,
  ) {}

  /** GET /admin/bidding/report */
  @Get('report')
  @RequirePermissions('bids.view')
  list(@Query() q: BiddingReportQuery) {
    return this.report.report(q);
  }

  /** GET /admin/bidding/facets — the filter dropdowns' options. */
  @Get('facets')
  @RequirePermissions('bids.view')
  facets() {
    return this.report.facets();
  }

  /**
   * PATCH /admin/bidding/:id/edit — revise the quantity.
   *
   * The ICDR guard lives in BidOperationsService, not here. A retail bid may
   * move either way; an HNI or QIB bid may only go up once it is with the
   * exchange. The screen disables what it can, but the refusal has to be real
   * on the server — a guard enforced only in the UI is not a guard.
   */
  @Patch(':id/edit')
  @RequirePermissions('bids.manage')
  async edit(@Param('id') id: string, @Body() dto: EditBidDto) {
    const op = await this.ops.queueModify(id, dto.qty, dto.price ?? null);
    return { ok: true, operationId: op.id, state: op.state, qty: op.qty };
  }

  /**
   * POST /admin/bidding/:id/cancel — withdraw the bid.
   *
   * Blocked for HNI and QIB once the bid is at the exchange. A bid we never
   * posted is our own record and any category may cancel it.
   */
  @Post(':id/cancel')
  @RequirePermissions('bids.manage')
  async cancel(@Param('id') id: string) {
    const op = await this.ops.queueCancel(id);
    return { ok: true, operationId: op.id, state: op.state };
  }

  /** POST /admin/bidding/:id/refresh — pull the exchange's latest view of
   *  ONE bid (UPI status, DP status, block amount, rejection text) and
   *  write it through the same code path the callback handler uses. A
   *  no-op returns the current stored values rather than an error — the
   *  exchange legitimately may not have seen the bid yet. */
  @Post(':id/refresh')
  @RequirePermissions('bids.manage')
  refresh(@Param('id') id: string) {
    return this.refreshSvc.refresh(id);
  }

  /**
   * POST /admin/bidding/:id/rebid — cancel this bid and create a
   * replacement, in one transaction. Local-first: the cancel row and the
   * new row are both written before either is posted, so a mid-flight
   * failure never leaves the investor holding nothing with their mandate
   * still released. Same ICDR direction rule as cancel — HNI and QIB may
   * not rebid once the bid is at the exchange.
   */
  @Post(':id/rebid')
  @RequirePermissions('bids.manage')
  async rebid(@Param('id') id: string, @Body() dto: RebidDto) {
    const r = await this.ops.queueRebid(id, dto?.qty, dto?.price ?? null);
    return { ok: true, cancelledId: r.cancelled, createdId: r.created, operationIds: r.ops };
  }

  /** GET /admin/bidding/summary — the operations matrix, grouped by
   *  (IPO × member × exchange). Same permission as the report — reads
   *  the ledger and never writes. */
  @Get('summary')
  @RequirePermissions('bids.view')
  reportSummary(@Query() q: BiddingSummaryQuery) {
    return this.summary.summary(q);
  }

  /** GET /admin/bidding/summary/facets — filter dropdowns for the summary. */
  @Get('summary/facets')
  @RequirePermissions('bids.view')
  summaryFacets() {
    return this.summary.facets();
  }
}

@Module({
  // RailModule exports BidOperationsService — the rules and the ledger live
  // there, and this module only calls them.
  imports: [JwtModule.register({}), RailModule],
  controllers: [BiddingController],
  providers: [BiddingReportService, BiddingSummaryService, BiddingRefreshService, PrismaService, PiiVaultService, JwtAuthGuard, PermissionsGuard],
  exports: [BiddingReportService, BiddingSummaryService],
})
export class BiddingModule {}
