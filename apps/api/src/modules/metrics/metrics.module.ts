import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MetricsController, MetricsAdminController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';

/**
 * Visitor tracking for the subscription pages.
 *
 * `RedisService` is not provided here — its module is `@Global()`. `PrismaService`
 * and the two guards are, matching every other module in this app. `JwtModule`
 * has to be imported for `JwtAuthGuard` to resolve its `JwtService` — a guard whose
 * dependency is missing fails at BOOT and takes down every route, not just its own.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [MetricsController, MetricsAdminController],
  providers: [MetricsService, PrismaService, JwtAuthGuard, PermissionsGuard],
  exports: [MetricsService],
})
export class MetricsModule {}
