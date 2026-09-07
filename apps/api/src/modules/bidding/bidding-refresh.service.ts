import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { mapUpiStatus, mapDpStatus, type TransactionRecord } from '@investoyard/rail-adapters';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../../common/tenant-context';
import { RailService } from '../rail/rail.service';
import { PrismaApplicationRepo } from '../rail/rail-callback.providers';

/**
 * BiddingRefreshService — the "Refresh UPI Status" pull for one bid.
 *
 * Push path (the exchange calling us): RailCallbackService → mapUpiStatus →
 * ApplicationRepo.updateStatus. That path is authoritative.
 *
 * Pull path (this service, the operator clicking Refresh): calls
 * RailOrchestrator.fetchTransactions for a narrow window, finds the record
 * with matching applicationNumber, runs it through the SAME mapUpiStatus /
 * mapDpStatus / updateStatus code the callback uses. Identical writes,
 * identical event log rows, identical notification triggers — the only
 * difference is who initiated the update.
 *
 * Deliberate choices:
 *  • Window is scoped from the bid's createdAt (with a small look-back so
 *    a bid placed at the boundary of a delta isn't missed) to now. Pulling
 *    a wide "everything today" window per click is wasted work; we know
 *    the applicationNumber we're looking for and roughly when it was
 *    placed.
 *  • fetchTransactions returns ALL records in the window — that's how the
 *    underlying exchange delta APIs work. We filter for our appNo after.
 *    Per-bid pull endpoints (BSE's ipoupistatus, NSE's equivalent) would
 *    be cheaper and are noted for a future adapter pass; the current
 *    implementation is honest to what the adapter exposes today.
 *  • No cache. A rapid burst of refreshes across bids of the same IPO +
 *    member does one exchange call per click. If that becomes a load
 *    pattern we add a 60-second per-(ipo, member) result cache; premature
 *    for a first version.
 */
@Injectable()
export class BiddingRefreshService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rail: RailService,
    private readonly apps: PrismaApplicationRepo,
  ) {}

  async refresh(applicationId: string): Promise<{
    applicationId: string;
    status: string;
    reason: string | null;
    amountBlocked: number | null;
    upiStatusText: string | null;
    refreshedAt: string;
  }> {
    const app = await tenantContext.runUnscoped(() => this.prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true, applicationNumber: true, memberCredentialId: true, createdAt: true,
        status: true, amountBlocked: true, upiStatusText: true, rejectionReason: true,
        ipo: { select: { symbol: true } },
      },
    }));
    if (!app) throw new NotFoundException(`Application ${applicationId} not found.`);
    if (!app.applicationNumber) {
      throw new BadRequestException('Nothing to refresh — this bid has not been sent to an exchange yet.');
    }
    if (!app.memberCredentialId) {
      throw new BadRequestException('Cannot refresh — the bid has no exchange member linked.');
    }

    // Window: from a few minutes before the bid was placed, so a bid at
    // the boundary of an exchange delta isn't missed, up to now.
    // TimeWindow takes strings in rail-specific format (NSE / BSE both
    // use yyyymmddHHMMSS in their delta APIs); the adapter's own layer
    // reformats to whatever the specific endpoint wants.
    const fromDate = new Date(app.createdAt.getTime() - 5 * 60_000);
    const toDate = new Date();
    const from = fmtRailTs(fromDate);
    const to = fmtRailTs(toDate);

    let records: TransactionRecord[];
    try {
      records = await this.rail.orchestrator.fetchTransactions({ from, to }, app.memberCredentialId);
    } catch (e: any) {
      throw new ServiceUnavailableException(
        `Exchange refresh failed: ${String(e?.message ?? e).slice(0, 180)}. Try again in a moment.`,
      );
    }

    const record = records.find(
      (r) => r.applicationNumber === app.applicationNumber && r.symbol === app.ipo.symbol,
    );
    if (!record) {
      // Refresh is allowed to be a no-op — the exchange hasn't seen the
      // bid yet, or the window missed it. Report what we found so the
      // operator sees "no change" is legitimate, not a failure.
      return {
        applicationId: app.id,
        status: app.status,
        reason: app.rejectionReason ?? null,
        amountBlocked: app.amountBlocked != null ? Number(app.amountBlocked) : null,
        upiStatusText: app.upiStatusText ?? null,
        refreshedAt: toDate.toISOString(),
      };
    }

    // Fold the transaction record through the callback code path so the
    // push and pull writes produce identical rows.
    if (record.upiPaymentStatus != null) {
      const { status } = mapUpiStatus(Number(record.upiPaymentStatus));
      await this.apps.updateStatus(app.id, {
        status,
        amountBlocked: record.amountBlocked ?? undefined,
        reason: record.status ?? undefined,
        rawEvent: { source: 'refresh', record },
      });
      // upiStatusText is the exchange's own wording — preserve it verbatim
      await tenantContext.runUnscoped(() => this.prisma.application.update({
        where: { id: app.id },
        data: { upiStatusText: String(record.upiPaymentStatus) },
      }));
    } else if (record.dpVerificationStatus === 'P' || record.dpVerificationStatus === 'S' || record.dpVerificationStatus === 'F') {
      // DpVerStatusFlag is 'P' | 'S' | 'F' (pending / success / failure) —
      // anything else the exchange sends we don't know how to interpret and
      // leave the status alone rather than write a wrong value.
      const status = mapDpStatus(record.dpVerificationStatus);
      await this.apps.updateStatus(app.id, {
        status,
        reason: record.status ?? undefined,
        rawEvent: { source: 'refresh', record },
      });
    }

    // Re-read to return the freshest values to the client so the row
    // updates without a page reload.
    const updated = await tenantContext.runUnscoped(() => this.prisma.application.findUnique({
      where: { id: app.id },
      select: { id: true, status: true, amountBlocked: true, upiStatusText: true, rejectionReason: true },
    }));
    return {
      applicationId: app.id,
      status: updated!.status,
      reason: updated!.rejectionReason ?? null,
      amountBlocked: updated!.amountBlocked != null ? Number(updated!.amountBlocked) : null,
      upiStatusText: updated!.upiStatusText ?? null,
      refreshedAt: toDate.toISOString(),
    };
  }
}

/**
 * yyyymmddHHMMSS in local time — the format both NSE and BSE delta
 * endpoints expect on their query APIs. Kept private; the moment a rail
 * needs a different timestamp shape the adapter is the place to reformat.
 */
function fmtRailTs(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
