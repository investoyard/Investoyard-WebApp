import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { ApplicationsService } from '../applications/applications.service';
import { ProviderConfigService } from '../../common/provider-config.service';
import { AdminService } from './admin.service';

class AddMemberDto {
  @Matches(/^\d{10}$/) mobile!: string;
  @IsOptional() @IsString() name?: string;
  @IsString() roleName!: string;
}
class UpdateMemberDto {
  @IsOptional() @IsString() roleName?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
}
class CreateRoleDto {
  @IsString() name!: string;
  @IsIn(['own', 'subtree', 'all']) scope!: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) permissions!: string[];
}
class UpdateRoleDto {
  @IsOptional() @IsIn(['own', 'subtree', 'all']) scope?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
}
class CreateRailDto {
  @IsIn(['NSE_EIPO', 'BSE_IBBS']) exchange!: string;
  @IsString() memberName!: string;
  @IsOptional() @IsString() memberType?: string;
  @IsString() loginId!: string;
  @IsString() memberCode!: string;
  @IsString() password!: string;
  @IsOptional() @IsString() ibbsId?: string;
  @IsOptional() @IsString() subBrokerCode?: string;
  @IsString() baseUrl!: string;
  @IsIn(['live', 'uat']) env!: string;
}
class UpdateRailDto {
  @IsOptional() @IsIn(['NSE_EIPO', 'BSE_IBBS']) exchange?: string;
  @IsOptional() @IsString() memberName?: string;
  @IsOptional() @IsString() memberType?: string;
  @IsOptional() @IsString() loginId?: string;
  @IsOptional() @IsString() memberCode?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() ibbsId?: string;
  @IsOptional() @IsString() subBrokerCode?: string;
  @IsOptional() @IsString() baseUrl?: string;
  @IsOptional() @IsIn(['live', 'uat']) env?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class ImportAllotmentsDto {
  @IsString() csv!: string; // registrar file: lines of "PAN,allottedLots" (optional header)
}

class ProviderConfigDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() settings?: Record<string, any>;
  @IsOptional() secrets?: Record<string, string>; // field → new value (omit to keep existing)
}

class RegisterTenantDto {
  @IsIn(['partner', 'whitelabel', 'branch']) kind!: string;
  @IsString() name!: string;
  @Matches(/^[A-Za-z0-9-]{2,40}$/, { message: 'slug must be 2–40 letters/digits/hyphens' }) slug!: string;
  @IsOptional() @IsString() parentSlug?: string;
  @IsOptional() @IsString() brandColor?: string;
  @IsOptional() @IsString() goldColor?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() customDomain?: string;
  @IsString() adminName!: string;
  @Matches(/^[A-Za-z0-9_.]{3,40}$/, { message: 'username must be 3–40 letters/digits/._' }) adminUsername!: string;
  @IsOptional() @IsString() adminPassword?: string;
}
class CreateOperatorDto {
  @Matches(/^[A-Za-z0-9_.]{3,40}$/) username!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() password?: string;
  @IsString() tenantSlug!: string;
  @IsString() roleName!: string;
}
class UpdateOperatorDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
  @IsOptional() @IsString() roleName?: string;
  @IsOptional() @IsString() password?: string;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly apps: ApplicationsService,
    private readonly providers: ProviderConfigService,
  ) {}

  /** Provider keys & integrations (SMS, push) — secrets vaulted, never returned. */
  @Get('providers')
  @RequirePermissions('providers.manage')
  listProviders() {
    return this.providers.list();
  }

  @Put('providers/:provider')
  @RequirePermissions('providers.manage')
  saveProvider(@Param('provider') provider: string, @Body() dto: ProviderConfigDto) {
    return this.providers.upsert(provider, dto);
  }

  /** Register a partner / white-label partner / branch + auto-create its admin login. */
  @Post('tenants')
  @RequirePermissions('tenants.manage')
  registerTenant(@Req() req: any, @Body() dto: RegisterTenantDto) {
    return this.admin.registerTenant(req.user.sub, dto as any);
  }

  /** Operator (username) accounts in the caller's scope. */
  @Get('operators')
  @RequirePermissions('users.view')
  operators(@Req() req: any) {
    return this.admin.listOperators(req.user.sub);
  }

  @Post('operators')
  @RequirePermissions('users.manage')
  createOperator(@Req() req: any, @Body() dto: CreateOperatorDto) {
    return this.admin.createOperator(req.user.sub, dto);
  }

  @Patch('operators/:id')
  @RequirePermissions('users.manage')
  updateOperator(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateOperatorDto) {
    return this.admin.updateOperator(req.user.sub, id, dto);
  }

  /** Back-office: bulk allotment from the registrar's CSV (platform operator). */
  @Post('allotments/:symbol/import')
  @RequirePermissions('bids.manage')
  importAllotments(@Param('symbol') symbol: string, @Body() dto: ImportAllotmentsDto) {
    return this.admin.importAllotments(symbol, dto.csv, (id, lots) => this.apps.recordAllotment(id, lots));
  }

  @Get('roles')
  @RequirePermissions('roles.view')
  roles() {
    return this.admin.listRoles();
  }

  @Get('permissions')
  @RequirePermissions('roles.view')
  permissions() {
    return this.admin.listPermissions();
  }

  @Get('audit')
  @RequirePermissions('audit.view')
  audit() {
    return this.admin.listAudit();
  }

  @Get('status')
  @RequirePermissions('dashboard.view')
  status() {
    return this.admin.systemStatus();
  }

  @Get('rails')
  @RequirePermissions('rails.manage')
  rails() {
    return this.admin.listRails();
  }

  @Post('rails')
  @RequirePermissions('rails.manage')
  createRail(@Body() dto: CreateRailDto) {
    return this.admin.createRail(dto);
  }

  @Patch('rails/:id')
  @RequirePermissions('rails.manage')
  updateRail(@Param('id') id: string, @Body() dto: UpdateRailDto) {
    return this.admin.updateRail(id, dto);
  }

  @Post('rails/:id/test')
  @RequirePermissions('rails.manage')
  testRail(@Param('id') id: string) {
    return this.admin.testRail(id);
  }

  @Post('roles')
  @RequirePermissions('roles.manage')
  createRole(@Body() dto: CreateRoleDto) {
    return this.admin.createRole(dto);
  }

  @Patch('roles/:id')
  @RequirePermissions('roles.manage')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.admin.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @RequirePermissions('roles.manage')
  deleteRole(@Param('id') id: string) {
    return this.admin.deleteRole(id);
  }

  @Get('members/:slug')
  @RequirePermissions('users.view')
  members(@Param('slug') slug: string) {
    return this.admin.listMembers(slug);
  }

  @Get('applications/:slug')
  @RequirePermissions('bids.view')
  applications(@Param('slug') slug: string) {
    return this.admin.listApplications(slug);
  }

  @Get('dashboard/:slug')
  @RequirePermissions('dashboard.view')
  dashboard(@Param('slug') slug: string) {
    return this.admin.dashboard(slug);
  }

  @Get('reports/:slug')
  @RequirePermissions('reports.view')
  reports(@Param('slug') slug: string) {
    return this.admin.reports(slug);
  }

  @Get('reports/:slug/export')
  @RequirePermissions('reports.view')
  async exportCsv(@Param('slug') slug: string, @Res({ passthrough: true }) res: any) {
    const csv = await this.admin.applicationsCsv(slug);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="investoyard-${slug}-applications.csv"`);
    return csv;
  }

  @Post('members/:slug')
  @RequirePermissions('users.manage')
  addMember(@Param('slug') slug: string, @Body() dto: AddMemberDto) {
    return this.admin.addMember(slug, dto);
  }

  @Patch('members/:slug/:membershipId')
  @RequirePermissions('users.manage')
  updateMember(@Param('slug') slug: string, @Param('membershipId') membershipId: string, @Body() dto: UpdateMemberDto) {
    return this.admin.updateMember(slug, membershipId, dto);
  }
}
