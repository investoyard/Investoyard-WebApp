import { Controller, Get, Global, Module, UseGuards } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { SuperadminGuard } from '../../common/superadmin.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AlertsService } from './alerts.service';

/**
 * Operator alerts for the dashboard and the bell. Platform operators only:
 * these are about OUR exchange logins and feeds, never a partner's business.
 */
@Controller('admin/alerts')
@UseGuards(JwtAuthGuard, SuperadminGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list() {
    return this.alerts.list();
  }
}

/**
 * GLOBAL because the things that raise alerts live in several modules — the
 * rail (logins, bid sending), the subscription poller (feeds) — and importing
 * this into each would be a cycle waiting to happen. It depends only on other
 * global services.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AlertsController],
  providers: [AlertsService, PrismaService, JwtAuthGuard, SuperadminGuard],
  exports: [AlertsService],
})
export class AlertsModule {}
