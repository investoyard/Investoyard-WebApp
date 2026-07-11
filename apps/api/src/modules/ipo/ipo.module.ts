import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RailModule } from '../rail/rail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IpoController } from './ipo.controller';
import { IpoService } from './ipo.service';

@Module({
  imports: [RailModule, NotificationsModule, JwtModule.register({})],
  controllers: [IpoController],
  providers: [IpoService, PrismaService, JwtAuthGuard, PermissionsGuard],
  exports: [IpoService],
})
export class IpoModule {}
