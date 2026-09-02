import { Module } from '@nestjs/common';
import { RailCallbackService } from '@investoyard/rail-adapters';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { RailService } from './rail.service';
import { BidOperationsService } from './bid-operations.service';
import { RailCallbackController } from './rail-callback.controller';
import { RailCallbackGuard } from './rail-callback.guard';
import { PrismaApplicationRepo, PushNotifier } from './rail-callback.providers';

@Module({
  imports: [NotificationsModule],
  controllers: [RailCallbackController],
  providers: [
    RailService,
    BidOperationsService,
    PrismaService,
    PiiVaultService,
    RailCallbackGuard,
    PrismaApplicationRepo,
    PushNotifier,
    {
      provide: RailCallbackService,
      useFactory: (repo: PrismaApplicationRepo, notifier: PushNotifier) =>
        new RailCallbackService(repo, notifier),
      inject: [PrismaApplicationRepo, PushNotifier],
    },
  ],
  exports: [RailService, BidOperationsService],
})
export class RailModule {}
