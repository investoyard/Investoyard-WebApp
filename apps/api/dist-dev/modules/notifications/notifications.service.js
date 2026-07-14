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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
/**
 * Persists a notification and delivers it to the user's registered devices.
 * Persistence + device fan-out is real; the actual FCM/APNs handshake is a STUB
 * (logs) — wire the provider SDK + server key in production.
 */
let NotificationsService = class NotificationsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.log = new common_1.Logger('Push');
    }
    async pushToUser(userId, msg) {
        const notif = await this.prisma.notification.create({
            data: {
                userId, tenantId: msg.tenantId ?? null, type: msg.type,
                title: msg.title, body: msg.body, data: (msg.data ?? undefined),
            },
        });
        const devices = await this.prisma.deviceToken.findMany({ where: { userId, active: true } });
        for (const d of devices) {
            // TODO(prod): real FCM/APNs send to d.token via the provider SDK.
            this.log.log(`[${d.platform}] "${msg.title}" → ${d.token.slice(0, 14)}… (${notif.type})`);
        }
        await this.prisma.notification.update({ where: { id: notif.id }, data: { sentAt: new Date() } });
        return { id: notif.id, delivered: devices.length };
    }
    async list(userId, limit = 50) {
        const rows = await this.prisma.notification.findMany({
            where: { userId }, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200),
        });
        return rows.map((n) => ({
            id: n.id, type: n.type, title: n.title, body: n.body,
            data: n.data ?? undefined, read: !!n.readAt,
            createdAt: n.createdAt.toISOString(),
        }));
    }
    async markRead(userId, id) {
        await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
        return { read: true };
    }
    async unreadCount(userId) {
        return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificationsService);
