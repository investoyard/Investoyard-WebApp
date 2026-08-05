import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { HealthModule } from '../health/health.module';
import { RailModule } from '../rail/rail.module';
import { ApplicationsModule } from '../applications/applications.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { EmpanelmentPdfService } from './empanelment-pdf.service';

@Module({
  imports: [JwtModule.register({}), HealthModule, RailModule, ApplicationsModule, SubscriptionModule],
  controllers: [AdminController],
  providers: [AdminService, EmpanelmentPdfService, PrismaService, PiiVaultService, JwtAuthGuard, PermissionsGuard],
})
export class AdminModule {}
