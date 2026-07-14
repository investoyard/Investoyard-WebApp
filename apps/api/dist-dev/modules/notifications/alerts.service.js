"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const tenant_context_1 = require("../../common/tenant-context");
const notifications_service_1 = require("./notifications.service");
const CLOSING_WINDOW_MS = 48 * 3600_000; // "closing soon" = closes within 48h
const SWEEP_INTERVAL_MS = 60 * 60_000; // hourly background sweep
/**
 * Watchlist alerts — notifies watchers when an IPO they follow is OPEN and again
 * when it's CLOSING SOON. Deduped per user+ipo+alert-type via the notification
 * history (JSON path query), so the hourly sweep never double-sends. Runs
 * unscoped (system job spanning all tenants), like the rail callbacks.
 */
let AlertsService = class AlertsService {
    constructor(prisma, notifications) {
        this.prisma = prisma;
        this.notifications = notifications;
        this.log = new common_1.Logger('Alerts');
    }
    onModuleInit() {
        if (process.env.ALERTS_DISABLED === 'true')
            return;
        this.timer = setInterval(() => this.run().catch((e) => this.log.warn(e.message)), SWEEP_INTERVAL_MS);
        this.timer.unref(); // never keep the process alive just for the sweep
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
    }
    /** One sweep over open IPOs → alert their watchers. Returns a summary. */
    async run() {
        return tenant_context_1.tenantContext.runUnscoped(async () => {
            const now = Date.now();
            const ipos = await this.prisma.ipo.findMany({
                where: { status: 'open' },
                select: { id: true, symbol: true, name: true, closeDate: true },
            });
            let sent = 0, skipped = 0;
            for (const ipo of ipos) {
                const closingSoon = ipo.closeDate != null &&
                    ipo.closeDate.getTime() > now &&
                    ipo.closeDate.getTime() - now <= CLOSING_WINDOW_MS;
                const watchers = await this.prisma.watchlistItem.findMany({
                    where: { ipoId: ipo.id },
                    select: { userId: true, tenantId: true },
                });
                for (const w of watchers) {
                    // "now open" — once per user per IPO
                    if (await this.sendOnce(w.userId, 'ipo_open', ipo.symbol, {
                        tenantId: w.tenantId,
                        title: `${ipo.symbol} is open 🔔`,
                        body: `${ipo.name} is now accepting applications${ipo.closeDate ? ` — closes ${ipo.closeDate.toISOString().slice(0, 10)}` : ''}.`,
                    }))
                        sent++;
                    else
                        skipped++;
                    // "closing soon" — once per user per IPO, only inside the window
                    if (closingSoon) {
                        if (await this.sendOnce(w.userId, 'ipo_closing', ipo.symbol, {
                            tenantId: w.tenantId,
                            title: `${ipo.symbol} closes soon ⏳`,
                            body: `Last chance — ${ipo.name} closes on ${ipo.closeDate.toISOString().slice(0, 10)}. Apply before the window shuts.`,
                        }))
                            sent++;
                        else
                            skipped++;
                    }
                }
            }
            this.log.log(`alert sweep: ${ipos.length} open IPO(s), sent ${sent}, deduped ${skipped}`);
            return { openIpos: ipos.length, sent, deduped: skipped };
        });
    }
    /** Push unless an identical alert (user + type + symbol) was already sent. */
    async sendOnce(userId, type, symbol, msg) {
        const already = await this.prisma.notification.findFirst({
            where: { userId, type, data: { path: ['ipoSymbol'], equals: symbol } },
            select: { id: true },
        });
        if (already)
            return false;
        await this.notifications.pushToUser(userId, {
            type, tenantId: msg.tenantId, title: msg.title, body: msg.body,
            data: { ipoSymbol: symbol },
        });
        return true;
    }
};
exports.AlertsService = AlertsService;
exports.AlertsService = AlertsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, notifications_service_1.NotificationsService])
], AlertsService);
