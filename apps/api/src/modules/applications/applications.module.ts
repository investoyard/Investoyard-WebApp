import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RailModule } from '../rail/rail.module';
import { QueueModule } from '../queue/queue.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';

@Module({
  imports: [RailModule, QueueModule, NotificationsModule, JwtModule.register({})],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, PrismaService, PiiVaultService, JwtAuthGuard, PermissionsGuard],
})
export class ApplicationsModule {}
