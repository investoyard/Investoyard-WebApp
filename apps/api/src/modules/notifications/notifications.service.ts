import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface PushMessage {
  type: string;
  title: string;
  body: string;
  tenantId?: string | null;
  data?: Record<string, any>;
}

/**
 * Persists a notification and delivers it to the user's registered devices.
 * Persistence + device fan-out is real; the actual FCM/APNs handshake is a STUB
 * (logs) — wire the provider SDK + server key in production.
 */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger('Push');
  constructor(private prisma: PrismaService) {}

  async pushToUser(userId: string, msg: PushMessage) {
    const notif = await this.prisma.notification.create({
      data: {
        userId, tenantId: msg.tenantId ?? null, type: msg.type,
        title: msg.title, body: msg.body, data: (msg.data ?? undefined) as any,
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

  async list(userId: string, limit = 50) {
    const rows = await this.prisma.notification.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200),
    });
    return rows.map((n) => ({
      id: n.id, type: n.type, title: n.title, body: n.body,
      data: n.data ?? undefined, read: !!n.readAt,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    return { read: true };
  }

  async unreadCount(userId: string) {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }
}
