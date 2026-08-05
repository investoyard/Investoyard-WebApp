import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RailModule } from '../rail/rail.module';
import { SubscriptionService } from './subscription.service';

/**
 * Live IPO subscription poller (NSE Query Server → `ipoSubscription`).
 * Imported by AppModule (runs the background poll) and AdminModule (manual trigger).
 */
@Module({
  imports: [RailModule],
  providers: [SubscriptionService, PrismaService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
