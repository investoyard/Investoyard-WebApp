import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [SettingsController],
  providers: [SettingsService, PrismaService, JwtAuthGuard, PermissionsGuard],
  exports: [SettingsService],
})
export class SettingsModule {}
