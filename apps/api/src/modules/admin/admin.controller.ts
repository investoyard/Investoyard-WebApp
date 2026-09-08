import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { ApplicationsService } from '../applications/applications.service';
import { ProviderConfigService } from '../../common/provider-config.service';
import { SubscriptionService } from '../subscription/subscription.service';
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
  @IsOptional() @IsString() checksumKey?: string;
  @IsOptional() @IsString() subBrokerCode?: string;
  @IsString() baseUrl!: string;
  @IsIn(['live', 'uat']) env!: string;
  @IsOptional() @IsBoolean() subscriptionUse?: boolean;
}
class UpdateRailDto {
  @IsOptional() @IsIn(['NSE_EIPO', 'BSE_IBBS']) exchange?: string;
  @IsOptional() @IsString() memberName?: string;
  @IsOptional() @IsString() memberType?: string;
  @IsOptional() @IsString() loginId?: string;
  @IsOptional() @IsString() memberCode?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() ibbsId?: string;
  @IsOptional() @IsString() checksumKey?: string;
  @IsOptional() @IsString() subBrokerCode?: string;
  @IsOptional() @IsString() baseUrl?: string;
  @IsOptional() @IsIn(['live', 'uat']) env?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() subscriptionUse?: boolean;
}

class ImportAllotmentsDto {
  @IsString() csv!: string; // registrar file: lines of "PAN,allottedLots" (optional header)
}

class ProviderConfigDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() settings?: Record<string, any>;
  @IsOptional() secrets?: Record<string, string>; // field → new value (omit to keep existing)
}

class TemplateDto {
  @IsIn(['sms', 'email', 'whatsapp']) channel!: string;
  @IsString() key!: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() dltTemplateId?: string;
  @IsOptional() @IsString() senderId?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() bodyHtml?: string;
}

class TestProviderDto {
  @IsString() to!: string; // 10-digit mobile (sms) or email address (email)
}

class CreateMessageTypeDto {
  @IsIn(['sms', 'email', 'whatsapp']) channel!: string;
  @IsString() key!: string;
  @IsString() label!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) vars?: string[];
}
class UpdateMessageTypeDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) vars?: string[];
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
  @IsOptional() profile?: Record<string, any>; // full empanelment form (JM/Nuvama) + doc URLs
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionRate?: number;
}
class UpdateTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(['active', 'suspended']) status?: string;
  @IsOptional() @IsString() brandColor?: string;
  @IsOptional() @IsString() goldColor?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() customDomain?: string;
  @IsOptional() profile?: Record<string, any>;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionRate?: number | null;
  // Partner API operator controls — see partner-scope.ts for the scope
  // vocabulary and the schema for the 1..500 clamp on the applicants cap.
  @IsOptional() @IsInt() @Min(1) @Max(500) partnerMaxApplicantsPerCall?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) partnerApiScopes?: string[];
}
class CreateClientDto {
  @Matches(/^\d{10}$/, { message: 'mobile must be 10 digits' }) mobile!: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() email?: string;
  @IsString() tenantSlug!: string;
}
class UpdateClientDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsIn(['active', 'suspended']) status?: 'active' | 'suspended';
}
class AddClientProfileDto {
  @IsString() fullName!: string;
  @IsOptional() @IsIn(['self', 'spouse', 'child', 'parent', 'sibling', 'other']) relationship?: string;
  @Matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, { message: 'PAN must look like ABCDE1234F' }) pan!: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsIn(['NSDL', 'CDSL']) depository!: 'NSDL' | 'CDSL';
  @IsString() dpId!: string;
  @IsString() clientId!: string;
  @IsOptional() @IsString() bankAccount?: string;
  @IsOptional() @IsString() ifsc?: string;
  @IsOptional() @IsString() upi?: string;
}
class CreateOperatorDto {
  @Matches(/^[A-Za-z0-9_.]{3,40}$/) username!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() password?: string;
  @IsString() tenantSlug!: string;
  @IsString() roleName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @Matches(/^\d{10}$/, { message: 'mobile must be 10 digits' }) mobile?: string;
}
class UpdateOperatorDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
  @IsOptional() @IsString() roleName?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @Matches(/^\d{10}$/, { message: 'mobile must be 10 digits' }) mobile?: string;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly apps: ApplicationsService,
    private readonly providers: ProviderConfigService,
    private readonly subscription: SubscriptionService,
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

  // ── per-tenant (white-label) integrations: SMS/email keys + message templates ──
  @Get('tenants/:slug/providers')
  @RequirePermissions('providers.manage')
  tenantProviders(@Param('slug') slug: string) {
    return this.admin.providersForTenant(slug);
  }

  @Put('tenants/:slug/providers/:provider')
  @RequirePermissions('providers.manage')
  saveTenantProvider(@Param('slug') slug: string, @Param('provider') provider: string, @Body() dto: ProviderConfigDto) {
    return this.admin.saveProviderForTenant(slug, provider, dto);
  }

  /** Clear a tenant's own provider config → re-inherits the platform default. */
  @Delete('tenants/:slug/providers/:provider')
  @RequirePermissions('providers.manage')
  resetTenantProvider(@Param('slug') slug: string, @Param('provider') provider: string) {
    return this.admin.resetProviderForTenant(slug, provider);
  }

  /** Send a real test SMS/email through this scope's effective config. */
  @Post('tenants/:slug/providers/:provider/test')
  @RequirePermissions('providers.manage')
  testTenantProvider(@Param('slug') slug: string, @Param('provider') provider: string, @Body() dto: TestProviderDto) {
    return this.admin.testProviderForTenant(slug, provider, dto.to);
  }

  @Get('templates')
  @RequirePermissions('providers.manage')
  templatesCatalog() {
    return this.admin.templatesCatalog();
  }

  // ── message-type catalog CRUD (platform-wide — superadmin only, enforced in service) ──
  @Post('templates/types')
  @RequirePermissions('tenants.manage')
  createMessageType(@Req() req: any, @Body() dto: CreateMessageTypeDto) {
    return this.admin.createMessageType(req.user.sub, dto);
  }

  @Patch('templates/types/:id')
  @RequirePermissions('tenants.manage')
  updateMessageType(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateMessageTypeDto) {
    return this.admin.updateMessageType(req.user.sub, id, dto);
  }

  @Delete('templates/types/:id')
  @RequirePermissions('tenants.manage')
  deleteMessageType(@Req() req: any, @Param('id') id: string) {
    return this.admin.deleteMessageType(req.user.sub, id);
  }

  /** The platform's template content for a key/locale — "Copy from platform" in partner scopes. */
  @Get('templates/resolve')
  @RequirePermissions('providers.manage')
  resolvePlatformTemplate(@Query('channel') channel: string, @Query('key') key: string, @Query('locale') locale?: string) {
    return this.admin.resolvePlatformTemplate(channel, key, locale);
  }

  /** Platform view: which white-label partner set its own SMS/email + overrode which templates. */
  @Get('integrations/overview')
  @RequirePermissions('tenants.manage')
  integrationsOverview() {
    return this.admin.integrationsOverview();
  }

  @Get('tenants/:slug/templates')
  @RequirePermissions('providers.manage')
  tenantTemplates(@Param('slug') slug: string) {
    return this.admin.templatesForTenant(slug);
  }

  @Put('tenants/:slug/templates')
  @RequirePermissions('providers.manage')
  saveTenantTemplate(@Param('slug') slug: string, @Body() dto: TemplateDto) {
    return this.admin.saveTemplateForTenant(slug, dto);
  }

  /** Remove a template row: tenant override → re-inherits platform; platform → drops that locale variant. */
  @Delete('tenants/:slug/templates')
  @RequirePermissions('providers.manage')
  deleteTenantTemplate(
    @Param('slug') slug: string,
    @Query('channel') channel: string,
    @Query('key') key: string,
    @Query('locale') locale?: string,
  ) {
    return this.admin.deleteTemplateForTenant(slug, { channel, key, locale });
  }

  /** Register a partner / white-label partner / branch + auto-create its admin login. */
  @Post('tenants')
  @RequirePermissions('tenants.manage')
  registerTenant(@Req() req: any, @Body() dto: RegisterTenantDto) {
    return this.admin.registerTenant(req.user.sub, dto as any);
  }

  /** Partners & branches the caller can manage (tree list). */
  @Get('tenants')
  @RequirePermissions('tenants.manage')
  listTenants(@Req() req: any) {
    return this.admin.listTenants(req.user.sub);
  }

  /**
   * A single tenant with its full empanelment profile. Reachable by
   * platform admins (via Tenants → click a partner) and by partner-tier
   * admins (via My Organisation) — the service enforces "superadmin OR
   * membership on this tenant" and strips operator-only fields from the
   * response for non-superadmin callers. Dropping the `tenants.manage`
   * gate here is deliberate: without it, a partner had no way to see
   * their own tenant profile at all.
   */
  @Get('tenants/:slug')
  tenantDetail(@Req() req: any, @Param('slug') slug: string) {
    return this.admin.tenantDetail(req.user.sub, slug);
  }

  /** Download the partner's pre-filled Business Associate Empanelment Form (PDF). */
  @Get('tenants/:slug/empanelment.pdf')
  @RequirePermissions('tenants.manage')
  async empanelmentPdf(@Req() req: any, @Param('slug') slug: string, @Res({ passthrough: true }) res: any): Promise<StreamableFile> {
    const { buffer, filename } = await this.admin.buildEmpanelmentPdf(req.user.sub, slug);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  /**
   * Same scope pattern as tenantDetail — reachable by any authenticated
   * operator; the service enforces "superadmin OR membership on this
   * tenant" AND silently drops fields a non-superadmin isn't allowed to
   * change (name/status/brand/domain/commission/partner-API controls),
   * so the My Organisation client doesn't need to know the field list.
   */
  @Patch('tenants/:slug')
  updateTenant(@Req() req: any, @Param('slug') slug: string, @Body() dto: UpdateTenantDto) {
    return this.admin.updateTenant(req.user.sub, slug, dto as any);
  }

  /* ---- clients (investors) ---- */
  @Get('clients')
  @RequirePermissions('clients.view')
  clients(@Req() req: any, @Query('tenant') tenant?: string, @Query('q') q?: string) {
    return this.admin.listClients(req.user.sub, { tenantSlug: tenant, q });
  }

  @Get('clients/:id')
  @RequirePermissions('clients.view')
  clientDetail(@Req() req: any, @Param('id') id: string) {
    return this.admin.clientDetail(req.user.sub, id);
  }

  @Post('clients')
  @RequirePermissions('clients.manage')
  createClient(@Req() req: any, @Body() dto: CreateClientDto) {
    return this.admin.createClient(req.user.sub, dto);
  }

  @Patch('clients/:id')
  @RequirePermissions('clients.manage')
  updateClient(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.admin.updateClient(req.user.sub, id, dto);
  }

  /**
   * DELETE /admin/clients/:id — hard-delete a client and everything they own
   * (applications, profiles, bid operations, watchlist, consents, device
   * tokens, memberships, GMP contributor row). The service enforces that
   * only a superadmin can run this; the permission decorator gates admin-
   * tier callers away from the endpoint itself so nobody without
   * clients.manage even reaches the service check.
   */
  @Delete('clients/:id')
  @RequirePermissions('clients.manage')
  hardDeleteClient(@Req() req: any, @Param('id') id: string) {
    return this.admin.hardDeleteClient(req.user.sub, id);
  }

  @Post('clients/:id/profiles')
  @RequirePermissions('clients.manage')
  addClientProfile(@Req() req: any, @Param('id') id: string, @Body() dto: AddClientProfileDto) {
    return this.admin.addClientProfile(req.user.sub, id, dto);
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

  /** Run a NSE Query-Server subscription sweep now over all open IPOs (the poller runs automatically in market hours). */
  @Post('rails/subscription/poll')
  @RequirePermissions('rails.manage')
  pollSubscription() {
    return this.subscription.pollOnce();
  }

  /** Refresh one IPO's subscription now. */
  @Post('rails/subscription/poll/:ipoId')
  @RequirePermissions('rails.manage')
  pollSubscriptionIpo(@Param('ipoId') ipoId: string) {
    return this.subscription.pollIpo(ipoId);
  }

  @Post('roles')
  @RequirePermissions('roles.manage')
  createRole(@Req() req: any, @Body() dto: CreateRoleDto) {
    return this.admin.createRole(req.user.sub, dto);
  }

  @Patch('roles/:id')
  @RequirePermissions('roles.manage')
  updateRole(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.admin.updateRole(req.user.sub, id, dto);
  }

  @Delete('roles/:id')
  @RequirePermissions('roles.manage')
  deleteRole(@Param('id') id: string) {
    return this.admin.deleteRole(id);
  }

  // Every /:slug endpoint threads req.user.sub through so the service
  // can refuse a partner admin who tries to query another tenant's data
  // by URL — without the callerId these were readable across tenants.
  @Get('members/:slug')
  @RequirePermissions('users.view')
  members(@Req() req: any, @Param('slug') slug: string) {
    return this.admin.listMembers(req.user.sub, slug);
  }

  @Get('applications/:slug')
  @RequirePermissions('bids.view')
  applications(@Req() req: any, @Param('slug') slug: string) {
    return this.admin.listApplications(req.user.sub, slug);
  }

  @Get('dashboard/:slug')
  @RequirePermissions('dashboard.view')
  dashboard(@Req() req: any, @Param('slug') slug: string) {
    return this.admin.dashboard(req.user.sub, slug);
  }

  @Get('reports/:slug')
  @RequirePermissions('reports.view')
  reports(@Req() req: any, @Param('slug') slug: string) {
    return this.admin.reports(req.user.sub, slug);
  }

  @Get('reports/:slug/export')
  @RequirePermissions('reports.view')
  async exportCsv(@Req() req: any, @Param('slug') slug: string, @Res({ passthrough: true }) res: any) {
    const csv = await this.admin.applicationsCsv(req.user.sub, slug);
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
