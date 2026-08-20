import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../../common/tenant-context';
import { NotificationsService } from './notifications.service';

const CLOSING_WINDOW_MS = 48 * 3600_000; // "closing soon" = closes within 48h
const SWEEP_INTERVAL_MS = 60 * 60_000;   // hourly background sweep

/**
 * Watchlist alerts — notifies watchers when an IPO they follow is OPEN and again
 * when it's CLOSING SOON. Deduped per user+ipo+alert-type via the notification
 * history (JSON path query), so the hourly sweep never double-sends. Runs
 * unscoped (system job spanning all tenants), like the rail callbacks.
 */
@Injectable()
export class AlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Alerts');
  private timer?: NodeJS.Timeout;

  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  onModuleInit() {
    if (process.env.ALERTS_DISABLED === 'true') return;
    this.timer = setInterval(() => this.run().catch((e) => this.log.warn(e.message)), SWEEP_INTERVAL_MS);
    this.timer.unref(); // never keep the process alive just for the sweep
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One sweep: open/closing alerts + allotment-day and listing-day reminders. */
  async run() {
    return tenantContext.runUnscoped(async () => {
      const now = Date.now();
      const todayStart = new Date(new Date().toISOString().slice(0, 10));
      const todayEnd = new Date(todayStart.getTime() + 86400000);
      const ipos = await this.prisma.ipo.findMany({
        where: {
          OR: [
            { status: 'open' },
            { allotmentDate: { gte: todayStart, lt: todayEnd } },
            { listingDate: { gte: todayStart, lt: todayEnd } },
          ],
        },
        select: { id: true, symbol: true, name: true, status: true, closeDate: true, allotmentDate: true, listingDate: true },
      });

      const isToday = (d: Date | null) => d != null && d >= todayStart && d < todayEnd;
      let sent = 0, skipped = 0;
      for (const ipo of ipos) {
        const closingSoon =
          ipo.status === 'open' &&
          ipo.closeDate != null &&
          ipo.closeDate.getTime() > now &&
          ipo.closeDate.getTime() - now <= CLOSING_WINDOW_MS;

        const watchers = await this.prisma.watchlistItem.findMany({
          where: { ipoId: ipo.id },
          select: { userId: true, tenantId: true },
        });

        for (const w of watchers) {
          // "now open" — once per user per IPO
          if (ipo.status === 'open') {
            if (await this.sendOnce(w.userId, 'ipo_open', ipo.symbol, {
              tenantId: w.tenantId,
              title: `${ipo.symbol} is open 🔔`,
              body: `${ipo.name} is now accepting applications${ipo.closeDate ? ` — closes ${ipo.closeDate.toISOString().slice(0, 10)}` : ''}.`,
            })) sent++; else skipped++;
          }

          // "closing soon" — once per user per IPO, only inside the window
          if (closingSoon) {
            if (await this.sendOnce(w.userId, 'ipo_closing', ipo.symbol, {
              tenantId: w.tenantId,
              title: `${ipo.symbol} closes soon ⏳`,
              body: `Last chance — ${ipo.name} closes on ${ipo.closeDate!.toISOString().slice(0, 10)}. Apply before the window shuts.`,
            })) sent++; else skipped++;
          }

          // "allotment today" — the reminder people actually set
          if (isToday(ipo.allotmentDate)) {
            if (await this.sendOnce(w.userId, 'ipo_allotment', ipo.symbol, {
              tenantId: w.tenantId,
              title: `${ipo.symbol} allotment today 📋`,
              body: `Basis of allotment for ${ipo.name} is expected today — check your allotment status.`,
            })) sent++; else skipped++;
          }

          // "listing today"
          if (isToday(ipo.listingDate)) {
            if (await this.sendOnce(w.userId, 'ipo_listing', ipo.symbol, {
              tenantId: w.tenantId,
              title: `${ipo.symbol} lists today 🎉`,
              body: `${ipo.name} debuts on the exchanges today.`,
            })) sent++; else skipped++;
          }
        }
      }
      this.log.log(`alert sweep: ${ipos.length} IPO(s) in scope, sent ${sent}, deduped ${skipped}`);
      return { openIpos: ipos.length, sent, deduped: skipped };
    });
  }

  /** Push unless an identical alert (user + type + symbol) was already sent. */
  private async sendOnce(
    userId: string,
    type: 'ipo_open' | 'ipo_closing' | 'ipo_allotment' | 'ipo_listing',
    symbol: string,
    msg: { tenantId?: string | null; title: string; body: string },
  ): Promise<boolean> {
    const already = await this.prisma.notification.findFirst({
      where: { userId, type, data: { path: ['ipoSymbol'], equals: symbol } },
      select: { id: true },
    });
    if (already) return false;
    await this.notifications.pushToUser(userId, {
      type, tenantId: msg.tenantId, title: msg.title, body: msg.body,
      data: { ipoSymbol: symbol },
    });
    return true;
  }
}
