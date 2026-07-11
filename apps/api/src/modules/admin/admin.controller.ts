import { Body, Controller, Delete, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { ApplicationsService } from '../applications/applications.service';
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

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly apps: ApplicationsService) {}

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
