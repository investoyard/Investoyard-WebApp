import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Allow, IsBoolean, IsOptional } from 'class-validator';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';

class SetOverrideDto {
  @Allow() value!: any; // coerced to the feature's valueType server-side
  @IsOptional() @IsBoolean() locked?: boolean;
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Feature catalog (declared before :slug so it isn't captured as a slug). */
  @Get('catalog')
  catalog() {
    return this.settings.listFeatures();
  }

  /** Effective (cascaded) settings for a tenant, with value/locked/source per feature. */
  @Get(':slug')
  resolve(@Param('slug') slug: string) {
    return this.settings.resolveBySlug(slug);
  }

  // Writes require `tenants.manage`, scoped by role to the target tenant's subtree.
  @Put(':slug/:key')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('tenants.manage')
  setOverride(@Param('slug') slug: string, @Param('key') key: string, @Body() dto: SetOverrideDto) {
    return this.settings.setOverride(slug, key, dto.value, dto.locked ?? false);
  }

  @Delete(':slug/:key')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('tenants.manage')
  clearOverride(@Param('slug') slug: string, @Param('key') key: string) {
    return this.settings.clearOverride(slug, key);
  }
}
