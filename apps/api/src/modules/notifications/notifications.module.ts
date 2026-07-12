import { Controller, Get, Param, Patch, Post, Req, UseGuards, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { NotificationsService } from './notifications.service';
import { AlertsService } from './alerts.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get() list(@Req() r: any) { return this.svc.list(r.user.sub); }
  @Get('unread-count') unread(@Req() r: any) { return this.svc.unreadCount(r.user.sub); }
  @Patch(':id/read') read(@Req() r: any, @Param('id') id: string) { return this.svc.markRead(r.user.sub, id); }
}

/** Operator: trigger a watchlist-alert sweep on demand (also runs hourly). */
@Controller('admin/alerts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Post('run')
  @RequirePermissions('ipos.manage')
  run() { return this.alerts.run(); }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [NotificationsController, AlertsController],
  providers: [NotificationsService, AlertsService, PrismaService, JwtAuthGuard, PermissionsGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
