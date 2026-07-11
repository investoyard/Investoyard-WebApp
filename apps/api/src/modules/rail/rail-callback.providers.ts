import { Injectable, Logger } from '@nestjs/common';
import { ApplicationRepo, ApplicationStatus, Notifier } from '@investoyard/rail-adapters';
import { PrismaService } from '../../prisma/prisma.service';

/** ApplicationRepo backed by Prisma — used by RailCallbackService. */
@Injectable()
export class PrismaApplicationRepo implements ApplicationRepo {
  constructor(private prisma: PrismaService) {}

  async findBySymbolAndApplicationNo(symbol: string, applicationNumber: string) {
    const ipo = await this.prisma.ipo.findUnique({ where: { symbol } });
    if (!ipo) return null;
    const app = await this.prisma.application.findFirst({
      where: { ipoId: ipo.id, applicationNumber },
      select: { id: true },
    });
    return app ?? null;
  }

  async updateStatus(
    id: string,
    patch: { status: ApplicationStatus; amountBlocked?: number; reason?: string; rawEvent: unknown },
  ) {
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
  }
}

/** Notifier — push/in-app. STUB: logs; wire FCM/APNs. */
@Injectable()
export class PushNotifier implements Notifier {
  private log = new Logger('Notifier');
  async notifyApplicationStatus(applicationId: string, status: ApplicationStatus) {
    this.log.log(`notify ${applicationId} -> ${status}`);
    // await fcm.sendToUserOfApplication(applicationId, status)
  }
}
