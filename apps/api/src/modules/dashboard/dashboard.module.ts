import { Controller, Get, Module, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminModule } from '../admin/admin.module';
import { MetricsModule } from '../metrics/metrics.module';
import { DashboardService } from './dashboard.service';

/**
 * GET /admin/dashboard/:slug?days=7|30|90 — the admin home screen.
 * Same route the old dashboard used; the response shape is new (2026-11-23).
 * The `:slug` param is what PermissionsGuard scopes on, so a partner admin can
 * only ask for their own tenant.
 */
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dash: DashboardService) {}

  @Get(':slug')
  @RequirePermissions('dashboard.view')
  get(@Req() req: any, @Param('slug') slug: string, @Query('days') days?: string) {
    return this.dash.build(req.user.sub, slug, days);
  }
}

@Module({
  imports: [JwtModule.register({}), AdminModule, MetricsModule],
  controllers: [DashboardController],
  providers: [DashboardService, PrismaService, JwtAuthGuard, PermissionsGuard],
})
export class DashboardModule {}
