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
exports.PushNotifier = exports.PrismaApplicationRepo = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const tenant_context_1 = require("../../common/tenant-context");
const notifications_service_1 = require("../notifications/notifications.service");
/**
 * ApplicationRepo backed by Prisma — used by RailCallbackService.
 *
 * Exchange callbacks are tenant-AGNOSTIC (the NSE host doesn't know our tenants),
 * but the request still passes TenantMiddleware, which sets the default tenant's
 * GUC — under RLS that would HIDE partner-tenant applications. So every lookup and
 * write here runs unscoped, like the other system paths.
 */
let PrismaApplicationRepo = class PrismaApplicationRepo {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findBySymbolAndApplicationNo(symbol, applicationNumber) {
        return tenant_context_1.tenantContext.runUnscoped(async () => {
            const ipo = await this.prisma.ipo.findUnique({ where: { symbol } });
            if (!ipo)
                return null;
            const app = await this.prisma.application.findFirst({
                where: { ipoId: ipo.id, applicationNumber },
                select: { id: true },
            });
            return app ?? null;
        });
    }
    async updateStatus(id, patch) {
        await tenant_context_1.tenantContext.runUnscoped(async () => {
            await this.prisma.$transaction([
                this.prisma.application.update({
                    where: { id },
                    data: {
                        status: patch.status,
                        amountBlocked: patch.amountBlocked ?? undefined,
                    },
                }),
                this.prisma.applicationStatusEvent.create({
                    data: { applicationId: id, status: patch.status, detail: patch.rawEvent },
                }),
            ]);
        });
    }
};
exports.PrismaApplicationRepo = PrismaApplicationRepo;
exports.PrismaApplicationRepo = PrismaApplicationRepo = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PrismaApplicationRepo);
/** Friendly investor-facing copy per callback-driven status. */
function statusMessage(status, symbol, amountBlocked) {
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
let PushNotifier = class PushNotifier {
    constructor(prisma, notifications) {
        this.prisma = prisma;
        this.notifications = notifications;
        this.log = new common_1.Logger('Notifier');
    }
    async notifyApplicationStatus(applicationId, status) {
        try {
            const app = await tenant_context_1.tenantContext.runUnscoped(async () => this.prisma.application.findUnique({
                where: { id: applicationId },
                select: { userId: true, tenantId: true, amountBlocked: true, ipo: { select: { symbol: true } } },
            }));
            if (!app)
                return;
            const msg = statusMessage(status, app.ipo.symbol, app.amountBlocked);
            await this.notifications.pushToUser(app.userId, {
                type: 'status', tenantId: app.tenantId, ...msg,
                data: { applicationId, ipoSymbol: app.ipo.symbol, status },
            });
        }
        catch (e) {
            this.log.warn(`notify ${applicationId} → ${status} failed: ${e.message}`);
        }
    }
};
exports.PushNotifier = PushNotifier;
exports.PushNotifier = PushNotifier = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, notifications_service_1.NotificationsService])
], PushNotifier);
