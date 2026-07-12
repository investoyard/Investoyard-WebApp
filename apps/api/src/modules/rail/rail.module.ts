import { Module } from '@nestjs/common';
import { RailCallbackService } from '@investoyard/rail-adapters';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { RailService } from './rail.service';
import { RailCallbackController } from './rail-callback.controller';
import { PrismaApplicationRepo, PushNotifier } from './rail-callback.providers';

@Module({
  imports: [NotificationsModule],
  controllers: [RailCallbackController],
  providers: [
    RailService,
    PrismaService,
    PiiVaultService,
    PrismaApplicationRepo,
    PushNotifier,
    {
      provide: RailCallbackService,
      useFactory: (repo: PrismaApplicationRepo, notifier: PushNotifier) =>
        new RailCallbackService(repo, notifier),
      inject: [PrismaApplicationRepo, PushNotifier],
    },
  ],
  exports: [RailService],
})
export class RailModule {}
