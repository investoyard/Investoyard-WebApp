import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { RailModule } from '../rail/rail.module';
import { PrismaSubmissionStore } from './submission-store';
import { SubmissionQueueService } from './submission-queue.service';

@Module({
  imports: [RailModule],
  providers: [PrismaService, PiiVaultService, PrismaSubmissionStore, SubmissionQueueService],
  exports: [SubmissionQueueService],
})
export class QueueModule {}
