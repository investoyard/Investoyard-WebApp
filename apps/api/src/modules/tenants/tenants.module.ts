import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [TenantsController],
  providers: [TenantsService, PrismaService],
  exports: [TenantsService],
})
export class TenantsModule {}
