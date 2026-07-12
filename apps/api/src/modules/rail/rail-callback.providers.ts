import { Injectable, Logger } from '@nestjs/common';
import { ApplicationRepo, ApplicationStatus, Notifier } from '@investoyard/rail-adapters';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../../common/tenant-context';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * ApplicationRepo backed by Prisma — used by RailCallbackService.
 *
 * Exchange callbacks are tenant-AGNOSTIC (the NSE host doesn't know our tenants),
 * but the request still passes TenantMiddleware, which sets the default tenant's
 * GUC — under RLS that would HIDE partner-tenant applications. So every lookup and
 * write here runs unscoped, like the other system paths.
 */
@Injectable()
export class PrismaApplicationRepo implements ApplicationRepo {
  constructor(private prisma: PrismaService) {}

  async findBySymbolAndApplicationNo(symbol: string, applicationNumber: string) {
    return tenantContext.runUnscoped(async () => {
      const ipo = await this.prisma.ipo.findUnique({ where: { symbol } });
      if (!ipo) return null;
      const app = await this.prisma.application.findFirst({
        where: { ipoId: ipo.id, applicationNumber },
        select: { id: true },
      });
      return app ?? null;
    });
  }

  async updateStatus(
    id: string,
    patch: { status: ApplicationStatus; amountBlocked?: number; reason?: string; rawEvent: unknown },
  ) {
    await tenantContext.runUnscoped(async () => {
      await this.prisma.$transaction([
        this.prisma.application.update({
          where: { id },
          data: {
            status: patch.status as any,
            amountBlocked: patch.amountBlocked ?? undefined,
          },
        }),
        this.prisma.applicationStatusEvent.create({
          data: { applicationId: id, status: patch.status as any, detail: patch.rawEvent as any },
        }),
      ]);
    });
  }
}

/** Friendly investor-facing copy per callback-driven status. */
function statusMessage(status: ApplicationStatus, symbol: string, amountBlocked?: number | null) {
  const amt = amountBlocked != null ? `₹${Number(amountBlocked).toLocaleString('en-IN')}` : undefined;
  switch (status) {
    case 'upi_blocked':
      return { title: `Funds blocked — ${symbol} ✅`, body: `Your UPI mandate is approved${amt ? ` and ${amt} is blocked` : ''}. You're in the allotment race.` };
    case 'released':
      return { title: `Block released — ${symbol}`, body: `The blocked amount${amt ? ` of ${amt}` : ''} has been released for ${symbol}.` };
    case 'dp_failed':
      return { title: `Verification failed — ${symbol}`, body: `Your demat details could not be verified for ${symbol}. Please check your profile and re-apply.` };
    default:
      return { title: `Update — ${symbol}`, body: `Your ${symbol} application status is now ${String(status).replace(/_/g, ' ')}.` };
  }
}

/**
 * Notifier — pushes callback-driven status changes to the investor's inbox +
 * devices via the notifications pipeline (previously a log-only stub).
 */
@Injectable()
export class PushNotifier implements Notifier {
  private log = new Logger('Notifier');
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  async notifyApplicationStatus(applicationId: string, status: ApplicationStatus) {
    try {
      const app = await tenantContext.runUnscoped(async () =>
        this.prisma.application.findUnique({
          where: { id: applicationId },
          select: { userId: true, tenantId: true, amountBlocked: true, ipo: { select: { symbol: true } } },
        }),
      );
      if (!app) return;
      const msg = statusMessage(status, app.ipo.symbol, app.amountBlocked as any);
      await this.notifications.pushToUser(app.userId, {
        type: 'status', tenantId: app.tenantId, ...msg,
        data: { applicationId, ipoSymbol: app.ipo.symbol, status },
      });
    } catch (e) {
      this.log.warn(`notify ${applicationId} → ${status} failed: ${(e as Error).message}`);
    }
  }
}
