import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { hashPassword } from '../../common/password';
import { RailService } from '../rail/rail.service';
import { HealthService } from '../health/health.module';
import { ProviderConfigService } from '../../common/provider-config.service';
import { TemplateService } from '../../common/template.service';
import { EmailService } from '../../common/email.service';
import { SmsService } from '../../common/sms.service';
import { EmpanelmentPdfService } from './empanelment-pdf.service';
import { tenantContext } from '../../common/tenant-context';
import { PERMISSION_CATALOG, ROLE_SCOPES, VALID_PERMISSIONS } from '../../common/permissions-catalog';

/**
 * Back-office operator management (users ↔ tenants ↔ roles). Reuses the RBAC layer:
 * routes are gated by permission + tenant-tree scope (PermissionsGuard on :slug), so a
 * platform SuperAdmin manages any tenant and a partner Admin only its own subtree.
 * User writes run UNSCOPED (a user is global by mobile; the membership binds the tenant).
 */
@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private vault: PiiVaultService,
    private health: HealthService,
    private rail: RailService,
    private providers: ProviderConfigService,
    private email: EmailService,
    private empanelmentPdf: EmpanelmentPdfService,
    private templates: TemplateService,
    private sms: SmsService,
  ) {}

  /* -------------------------------- white-label integrations (per-tenant SMS/email + templates) */

  /** A tenant's provider configs (masked). Slug resolves the tenant; guard scopes access. */
  async providersForTenant(slug: string) {
    const t = await this.tenantBySlug(slug);
    return this.providers.listForTenant(t.id);
  }
  async saveProviderForTenant(slug: string, provider: string, dto: any) {
    const t = await this.tenantBySlug(slug);
    return this.providers.upsertForTenant(t.id, provider, dto);
  }
  /** Clear a tenant's own provider config → re-inherits the platform default. */
  async resetProviderForTenant(slug: string, provider: string) {
    const t = await this.tenantBySlug(slug);
    return this.providers.deleteForTenant(t.id, provider);
  }
  /**
   * Fire a real test message through the EFFECTIVE config for this scope (own or
   * inherited) so the operator can prove keys work before go-live. SMS sends the
   * provider's OTP template with a fixed test code; email sends a short test mail.
   */
  async testProviderForTenant(slug: string, provider: string, to: string) {
    const t = await this.tenantBySlug(slug);
    if (provider === 'sms') {
      const mobile = String(to ?? '').replace(/\D/g, '');
      if (!/^\d{10}$/.test(mobile)) throw new BadRequestException('Enter a 10-digit mobile number.');
      return this.sms.send(mobile, 'Investoyard test message. Your OTP is 123456.', { otp: '123456' }, { tenantId: t.id });
    }
    if (provider === 'email') {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to ?? ''))) throw new BadRequestException('Enter a valid email address.');
      return this.email.send(
        {
          to: String(to),
          subject: 'Investoyard — test email',
          html: '<p>This is a test email from the Investoyard admin console. Your email provider configuration works.</p>',
        },
        { tenantId: t.id },
      );
    }
    throw new BadRequestException(`Test send is available for SMS and email only.`);
  }

  /** Message-type catalog (operator-managed) — for the admin Templates UI. */
  async templatesCatalog() {
    return { keys: await this.templates.listTypes() };
  }
  /** The type catalog is PLATFORM-WIDE — only a platform superadmin may change it
   *  (the guard alone would pass any tenants.manage holder on slug-less routes). */
  private async assertSuperadmin(callerId: string) {
    const scope = await this.callerScope(callerId);
    if (!scope.superadmin) throw new ForbiddenException('Only a platform admin can manage message types.');
  }
  async createMessageType(callerId: string, dto: any) {
    await this.assertSuperadmin(callerId);
    return this.templates.createType(dto);
  }
  async updateMessageType(callerId: string, id: string, dto: any) {
    await this.assertSuperadmin(callerId);
    return this.templates.updateType(id, dto);
  }
  async deleteMessageType(callerId: string, id: string) {
    await this.assertSuperadmin(callerId);
    return this.templates.deleteType(id);
  }
  /** A tenant's OWN template overrides (empty ⇒ inherits platform). */
  async templatesForTenant(slug: string) {
    const t = await this.tenantBySlug(slug);
    return this.templates.listForTenant(t.id);
  }
  async saveTemplateForTenant(slug: string, dto: any) {
    const t = await this.tenantBySlug(slug);
    return this.templates.upsertForTenant(t.id, dto);
  }
  async deleteTemplateForTenant(slug: string, q: { channel: string; key: string; locale?: string }) {
    const t = await this.tenantBySlug(slug);
    return this.templates.deleteForTenant(t.id, q);
  }
  /** The PLATFORM's template content for a key/locale — powers "Copy from platform" in partner scopes. */
  resolvePlatformTemplate(channel: string, key: string, locale?: string) {
    return this.templates.resolve(channel, key, undefined, locale || 'en');
  }

  /** Platform oversight: which white-label partner has set its own SMS/email + overridden which templates. */
  async integrationsOverview() {
    const tenants = await this.prisma.tenant.findMany({
      where: { flags: { path: ['whitelabel'], equals: true } },
      select: { id: true, slug: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
    const ids = tenants.map((t) => t.id);
    if (ids.length === 0) return [];
    const [providers, templates] = await Promise.all([
      this.prisma.providerConfig.findMany({ where: { tenantId: { in: ids }, enabled: true }, select: { tenantId: true, provider: true } }),
      this.prisma.messageTemplate.findMany({ where: { tenantId: { in: ids } }, select: { tenantId: true, channel: true, key: true } }),
    ]);
    return tenants.map((t) => ({
      slug: t.slug,
      name: t.name,
      code: t.code ?? undefined,
      providers: providers.filter((p) => p.tenantId === t.id).map((p) => p.provider),
      templates: templates.filter((tp) => tp.tenantId === t.id).map((tp) => `${tp.channel}:${tp.key}`),
    }));
  }

  private readonly log = new Logger(AdminService.name);

  /** Operator-facing system/infra status (component health + configured modes). */
  async systemStatus() {
    const [database, redis, sms] = await Promise.all([
      this.health.database(),
      this.health.redisState(),
      this.providers.effective('sms'),
    ]);
    return {
      database,
      redis,
      queue: process.env.REDIS_URL ? 'BullMQ (Redis)' : 'inline (dev)',
      sms: sms ? `configured: ${sms.settings.providerName ?? 'provider'}` : 'dev (logged)',
      vault: process.env.KMS_KEY_ID ? 'AWS KMS' : 'local AES (dev)',
      node: process.version,
      uptimeSec: Math.round(process.uptime()),
    };
  }

  /* ------------------------------------------------ exchange rail credentials */

  /** List rail member credentials — secrets are masked (never returned raw). */
  async listRails() {
    const rows = await this.prisma.memberCredential.findMany({ orderBy: { memberName: 'asc' } });
    return rows.map((c) => ({
      id: c.id, exchange: c.exchange, memberName: c.memberName, memberType: c.memberType,
      loginId: c.loginId, memberCode: c.memberCode, subBrokerCode: c.subBrokerCode ?? undefined,
      baseUrl: c.baseUrl, env: c.env, active: c.active, subscriptionUse: c.subscriptionUse,
      passwordSet: !!c.passwordRef, ibbsIdSet: !!c.ibbsIdRef, checksumKeySet: !!c.checksumKeyRef,
    }));
  }

  async createRail(dto: any) {
    if (!['NSE_EIPO', 'BSE_IBBS'].includes(dto.exchange)) throw new BadRequestException('Invalid exchange');
    if (!['live', 'uat'].includes(dto.env)) throw new BadRequestException("env must be 'live' or 'uat'");
    const cred = await this.prisma.memberCredential.create({
      data: {
        tenantId: 't-platform', exchange: dto.exchange, memberName: dto.memberName,
        memberType: dto.memberType ?? 'merchant_banker', loginId: dto.loginId, memberCode: dto.memberCode,
        passwordRef: await this.vault.tokenize(dto.password), // vaulted, never returned
        ibbsIdRef: dto.ibbsId ? await this.vault.tokenize(dto.ibbsId) : null,
        checksumKeyRef: dto.checksumKey ? await this.vault.tokenize(dto.checksumKey) : null,
        subBrokerCode: dto.subBrokerCode ?? null, baseUrl: dto.baseUrl, env: dto.env, active: dto.active ?? true,
        subscriptionUse: dto.subscriptionUse ?? false,
      },
    });
    if (cred.subscriptionUse) await this.soleSubscriptionCred(cred.id, cred.exchange);
    return { id: cred.id };
  }

  /** Only ONE credential per exchange carries the "use for subscription" tag. */
  private async soleSubscriptionCred(keepId: string, exchange: string) {
    await this.prisma.memberCredential.updateMany({
      where: { exchange: exchange as any, subscriptionUse: true, id: { not: keepId } },
      data: { subscriptionUse: false },
    });
  }

  async updateRail(id: string, dto: any) {
    const existing = await this.prisma.memberCredential.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Credential not found');
    const data: any = {};
    for (const k of ['memberName', 'memberType', 'loginId', 'memberCode', 'subBrokerCode', 'baseUrl', 'env', 'active', 'exchange', 'subscriptionUse']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.password) data.passwordRef = await this.vault.tokenize(dto.password);  // re-set secret
    if (dto.ibbsId !== undefined) data.ibbsIdRef = dto.ibbsId ? await this.vault.tokenize(dto.ibbsId) : null;
    if (dto.checksumKey !== undefined) data.checksumKeyRef = dto.checksumKey ? await this.vault.tokenize(dto.checksumKey) : null;
    const updated = await this.prisma.memberCredential.update({ where: { id }, data });
    if (data.subscriptionUse === true) await this.soleSubscriptionCred(id, updated.exchange);
    return { updated: true };
  }

  /**
   * LIVE connection test — resolves the credential (secrets from the vault) and
   * performs the rail's real /login handshake with a timeout. Outcomes:
   *   connected   → the exchange issued a session token
   *   rejected    → the endpoint responded but refused (bad creds / guarded adapter)
   *   unreachable → network/DNS/timeout (endpoint not reachable from here)
   *   incomplete  → required fields missing (no attempt made)
   */
  async testRail(id: string) {
    const c = await this.prisma.memberCredential.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Credential not found');
    if (!(c.active && c.baseUrl && c.loginId && c.memberCode && c.passwordRef)) {
      return { ok: false, outcome: 'incomplete', note: 'Fill base URL, login, member code and password first.' };
    }
    const started = Date.now();
    let cred;
    try {
      cred = await this.rail.resolveCredential(id); // decrypts secrets from the vault
    } catch {
      return { ok: false, outcome: 'invalid_secret', note: 'Stored secret could not be decrypted — re-enter the password.' };
    }
    try {
      const adapter = (await import('@investoyard/rail-adapters')).getAdapter(cred.exchange);
      const session: any = await Promise.race([
        adapter.login(cred),
        new Promise((_, rej) => setTimeout(() => rej(new Error('__timeout__')), 10_000)),
      ]);
      return { ok: true, outcome: 'connected', note: `Session token issued (${Date.now() - started}ms).`, tokenPreview: String(session?.token ?? '').slice(0, 6) + '…' };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg === '__timeout__') return { ok: false, outcome: 'unreachable', note: 'Timed out after 10s.' };
      // The adapter's httpJson wraps everything in RailError: code NETWORK/TIMEOUT
      // means transport failure (unreachable); anything else means the endpoint
      // responded but refused (bad creds / guarded adapter / bad payload).
      if (e?.code === 'NETWORK' || e?.code === 'TIMEOUT') {
        return { ok: false, outcome: 'unreachable', note: msg.slice(0, 160) };
      }
      return { ok: false, outcome: 'rejected', note: msg.slice(0, 160) };
    }
  }

  /** All assignable roles (platform system templates + any custom). */
  async listRoles() {
    const roles = await this.prisma.role.findMany({ orderBy: { name: 'asc' } });
    return roles.map((r) => ({ id: r.id, name: r.name, scope: r.scope, permissions: r.permissions, isSystem: r.isSystem }));
  }

  /** Permission catalog for the role editor. */
  listPermissions() {
    return PERMISSION_CATALOG;
  }

  /** Recent operator-mutation audit trail (platform governance). */
  async listAudit(limit = 100) {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { at: 'desc' }, take: Math.min(limit, 500) });
    return rows.map((a) => ({
      id: a.id,
      at: a.at.toISOString(),
      actorMobile: a.actorMobile ?? undefined,
      action: a.action,
      targetType: a.targetType ?? undefined,
      targetLabel: a.targetLabel ?? undefined,
      tenantSlug: a.tenantSlug ?? undefined,
    }));
  }

  private validateRole(scope: string, permissions: string[]) {
    if (!ROLE_SCOPES.includes(scope as any)) throw new BadRequestException(`scope must be one of ${ROLE_SCOPES.join(', ')}`);
    const bad = permissions.filter((p) => !VALID_PERMISSIONS.has(p));
    if (bad.length) throw new BadRequestException(`Unknown permission(s): ${bad.join(', ')}`);
  }

  /** Create a custom (platform-level) role. */
  async createRole(dto: { name: string; scope: string; permissions: string[] }) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Role name is required');
    this.validateRole(dto.scope, dto.permissions);
    try {
      const role = await this.prisma.role.create({
        data: { tenantId: 't-platform', name, scope: dto.scope as any, permissions: dto.permissions, isSystem: false },
      });
      return { id: role.id, name: role.name, scope: role.scope, permissions: role.permissions, isSystem: role.isSystem };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(`A role named '${name}' already exists.`);
      throw e;
    }
  }

  /** Edit a role's scope/permissions. Only the all-powerful SuperAdmin (`*`) role is locked. */
  async updateRole(id: string, dto: { scope?: string; permissions?: string[] }) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.permissions.includes('*')) throw new BadRequestException('The SuperAdmin role cannot be edited.');
    const scope = dto.scope ?? role.scope;
    const permissions = dto.permissions ?? role.permissions;
    this.validateRole(scope, permissions);
    const updated = await this.prisma.role.update({ where: { id }, data: { scope: scope as any, permissions } });
    return { id: updated.id, name: updated.name, scope: updated.scope, permissions: updated.permissions, isSystem: updated.isSystem };
  }

  /** Delete a custom role (blocked for system roles or roles still assigned). */
  async deleteRole(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted.');
    const inUse = await this.prisma.membership.count({ where: { roleId: id } });
    if (inUse > 0) throw new ConflictException(`Role is assigned to ${inUse} member(s); reassign them first.`);
    await this.prisma.role.delete({ where: { id } });
    return { deleted: true };
  }

  private async tenantBySlug(slug: string) {
    const t = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, name: true } });
    if (!t) throw new NotFoundException(`Tenant '${slug}' not found`);
    return t;
  }

  /** Ids of a tenant and all its descendants (BFS). */
  private async subtreeIds(rootId: string): Promise<string[]> {
    const ids = [rootId];
    const queue = [rootId];
    while (queue.length) {
      const pid = queue.shift()!;
      const kids = await this.prisma.tenant.findMany({ where: { parentId: pid }, select: { id: true } });
      for (const k of kids) { ids.push(k.id); queue.push(k.id); }
    }
    return ids;
  }

  /* ------------------------------------------------ partners / branches / operators */

  // Default permission sets for auto-created tenant admins.
  private static PARTNER_ADMIN_PERMS = ['dashboard.view', 'ipos.view', 'bids.view', 'bids.manage', 'clients.view', 'clients.manage', 'reports.view', 'users.view', 'users.manage', 'roles.view', 'audit.view', 'tenants.manage', 'settings.manage'];
  // White-label admins additionally manage their OWN SMS/email keys + message templates.
  private static WHITELABEL_ADMIN_PERMS = ['dashboard.view', 'ipos.view', 'bids.view', 'bids.manage', 'clients.view', 'clients.manage', 'reports.view', 'users.view', 'users.manage', 'roles.view', 'audit.view', 'tenants.manage', 'settings.manage', 'providers.manage'];
  private static BRANCH_ADMIN_PERMS = ['dashboard.view', 'ipos.view', 'bids.view', 'bids.manage', 'clients.view', 'clients.manage', 'reports.view', 'users.view'];

  /** What tenants can the caller manage? superadmin → all; else the union of their subtree/own scopes. */
  private async callerScope(userId: string): Promise<{ superadmin: boolean; tenantIds: Set<string> }> {
    return tenantContext.runUnscoped(async () => {
      const memberships = await this.prisma.membership.findMany({ where: { userId, status: 'active' }, include: { role: true } });
      if (memberships.some((m) => m.role.scope === 'all')) return { superadmin: true, tenantIds: new Set<string>() };
      const ids = new Set<string>();
      for (const m of memberships) {
        if (m.role.scope === 'subtree') (await this.subtreeIds(m.tenantId)).forEach((i) => ids.add(i));
        else if (m.role.scope === 'own') ids.add(m.tenantId);
      }
      return { superadmin: false, tenantIds: ids };
    });
  }

  private genPassword(): string {
    // Readable temporary password: 3 blocks, avoids ambiguous chars.
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ', b = 'abcdefghijkmnpqrstuvwxyz', d = '23456789';
    const pick = (s: string, n: number) => Array.from(randomBytes(n)).map((x) => s[x % s.length]).join('');
    return `${pick(a, 2)}${pick(b, 4)}-${pick(d, 4)}`;
  }

  /**
   * Register a partner / white-label partner / branch and auto-create its admin login.
   *   partner    → under the platform, Investoyard-branded, admin scope 'subtree'
   *   whitelabel → under the platform, own brand + domain, GMP off & locked
   *   branch     → under a partner (parentSlug), admin scope 'own'
   * Returns the tenant + the admin credential (temporary password shown ONCE if generated).
   */
  /** Next sequential 6-digit channel code (partners + branches share the sequence, from 601001). */
  private async nextChannelCode(): Promise<string> {
    const last = await this.prisma.tenant.findFirst({ where: { code: { not: null } }, orderBy: { code: 'desc' }, select: { code: true } });
    return String(last?.code ? Number(last.code) + 1 : 601001);
  }

  async registerTenant(callerId: string, dto: {
    kind: 'partner' | 'whitelabel' | 'branch'; name: string; slug: string; parentSlug?: string;
    brandColor?: string; goldColor?: string; logoUrl?: string; customDomain?: string;
    adminName: string; adminUsername: string; adminPassword?: string;
    profile?: Record<string, any>; // full empanelment form (JM/Nuvama fields + document URLs)
    commissionRate?: number; // % commission on this channel's bids
  }) {
    const scope = await this.callerScope(callerId);
    const slug = dto.slug.trim().toLowerCase();
    const adminUsername = dto.adminUsername.trim().toLowerCase();

    let parentId: string; let type: string; let roleScope: 'own' | 'subtree'; let perms: string[];
    let flags: any; let lockGmpOff = false;

    if (dto.kind === 'branch') {
      if (!dto.parentSlug) throw new BadRequestException('A branch needs a parent partner.');
      const parent = await this.tenantBySlug(dto.parentSlug);
      if (!scope.superadmin && !scope.tenantIds.has(parent.id)) throw new ForbiddenException('You can only add branches under your own partner.');
      parentId = parent.id; type = 'branch'; roleScope = 'own'; perms = AdminService.BRANCH_ADMIN_PERMS;
    } else {
      if (!scope.superadmin) throw new ForbiddenException('Only a platform admin can register partners.');
      const platform = await tenantContext.runUnscoped(async () => this.prisma.tenant.findFirst({ where: { type: 'platform' } }));
      if (!platform) throw new NotFoundException('Platform tenant missing');
      parentId = platform.id; type = 'partner'; roleScope = 'subtree'; perms = AdminService.PARTNER_ADMIN_PERMS;
      if (dto.kind === 'whitelabel') { flags = { whitelabel: true, gmpEnabled: false }; lockGmpOff = true; perms = AdminService.WHITELABEL_ADMIN_PERMS; }
    }

    return tenantContext.runUnscoped(async () => {
      try {
        const code = await this.nextChannelCode();
        const tenant = await this.prisma.tenant.create({
          data: {
            type: type as any, parentId, slug, name: dto.name.trim(),
            brandColor: dto.brandColor || undefined, goldColor: dto.goldColor || undefined,
            logoUrl: dto.logoUrl || undefined, customDomain: dto.customDomain?.trim() || undefined,
            flags: flags ?? undefined,
            profile: dto.profile && Object.keys(dto.profile).length ? dto.profile : undefined,
            code,
            commissionRate: dto.commissionRate != null ? dto.commissionRate : undefined,
          },
        });
        if (lockGmpOff) {
          await this.prisma.tenantSetting.create({ data: { tenantId: tenant.id, featureKey: 'gmpEnabled', value: false, locked: true } });
        }
        const role = await this.prisma.role.create({ data: { tenantId: tenant.id, name: 'Admin', scope: roleScope, permissions: perms, isSystem: true } });
        const password = dto.adminPassword?.trim() || this.genPassword();
        const user = await this.prisma.user.create({
          data: { tenantId: tenant.id, username: adminUsername, name: dto.adminName.trim(), passwordHash: await hashPassword(password), status: 'active' },
        });
        await this.prisma.membership.create({ data: { userId: user.id, tenantId: tenant.id, roleId: role.id } });
        // Auto-generate the empanelment form and email it to the partner (fire-and-forget —
        // registration must not fail if email is off or the send errors).
        void this.sendEmpanelmentForm(
          { name: tenant.name, code: tenant.code, kind: dto.kind, createdAt: tenant.createdAt },
          dto.profile,
        );
        return {
          tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, type: tenant.type, code: tenant.code, customDomain: tenant.customDomain, whitelabel: dto.kind === 'whitelabel' },
          admin: { username: user.username, name: user.name, ...(dto.adminPassword ? {} : { temporaryPassword: password }) },
        };
      } catch (e: any) {
        if (e?.code === 'P2002') {
          const t = String(e?.meta?.target ?? '');
          const field = t.includes('username') ? 'username' : t.includes('customDomain') ? 'custom domain' : t.includes('code') ? 'channel code' : 'slug';
          throw new ConflictException(`That ${field} is already taken.`);
        }
        throw e;
      }
    });
  }

  /** Build the empanelment-form PDF for a partner (operator download; scope-checked). */
  async buildEmpanelmentPdf(callerId: string, slug: string): Promise<{ buffer: Buffer; filename: string }> {
    const scope = await this.callerScope(callerId);
    const t = await tenantContext.runUnscoped(async () =>
      this.prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, code: true, type: true, profile: true, createdAt: true } }),
    );
    if (!t) throw new NotFoundException(`Tenant '${slug}' not found`);
    if (!scope.superadmin && !scope.tenantIds.has(t.id)) throw new ForbiddenException('Outside your scope.');
    const buffer = await this.empanelmentPdf.build(t.profile as any, { name: t.name, code: t.code, kind: t.type, createdAt: t.createdAt });
    const safe = String(t.code || slug).replace(/[^a-z0-9_-]/gi, '');
    return { buffer, filename: `investoyard-empanelment-${safe}.pdf` };
  }

  /** Generate the empanelment PDF and email it to the partner's contact email (auto on register). */
  private async sendEmpanelmentForm(
    meta: { name: string; code?: string | null; kind?: string; createdAt?: Date },
    profile?: Record<string, any>,
  ): Promise<void> {
    try {
      const to = profile?.contactEmail;
      if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) {
        this.log.log(`empanelment form for ${meta.name}: no valid contact email — skipping auto-send (still downloadable).`);
        return;
      }
      const buffer = await this.empanelmentPdf.build(profile ?? {}, meta);
      const who = profile?.fullName || profile?.entityName || meta.name;
      const res = await this.email.send({
        to: String(to),
        subject: `Investoyard — Business Associate Empanelment Form${meta.code ? ` (Code ${meta.code})` : ''}`,
        text:
          `Dear ${who},\n\n` +
          `Welcome to Investoyard. Please find attached your Business Associate Empanelment Form, pre-filled with the ` +
          `details provided at registration.\n\n` +
          `Kindly print it, verify the details, sign (and stamp, for entities) where indicated, and return a scanned ` +
          `copy along with the supporting documents.\n\nRegards,\nTeam Investoyard`,
        attachments: [{ filename: `investoyard-empanelment-${meta.code || 'form'}.pdf`, content: buffer, contentType: 'application/pdf' }],
      });
      if (res.dev) this.log.log(`empanelment form for ${meta.name}: email not configured — generated but not sent (downloadable).`);
      else if (!res.sent) this.log.warn(`empanelment form email to ${to} failed: ${res.error}`);
      else this.log.log(`empanelment form emailed to ${to} for ${meta.name}.`);
    } catch (e: any) {
      this.log.warn(`sendEmpanelmentForm failed for ${meta.name}: ${e?.message ?? e}`);
    }
  }

  /** A single tenant with its full empanelment profile (for the partner detail/edit view). */
  async tenantDetail(callerId: string, slug: string) {
    const scope = await this.callerScope(callerId);
    return tenantContext.runUnscoped(async () => {
      const t = await this.prisma.tenant.findUnique({
        where: { slug },
        include: { parent: { select: { slug: true, name: true } }, _count: { select: { children: true, users: true, memberships: true } } },
      });
      if (!t) throw new NotFoundException(`Tenant '${slug}' not found`);
      if (!scope.superadmin && !scope.tenantIds.has(t.id)) throw new ForbiddenException('Outside your scope.');
      const flags = (t.flags as any) ?? {};
      return {
        id: t.id, slug: t.slug, name: t.name, type: t.type, status: t.status,
        parent: t.parent ?? undefined, whitelabel: !!flags.whitelabel,
        code: t.code ?? undefined, commissionRate: t.commissionRate != null ? Number(t.commissionRate) : undefined,
        brandColor: t.brandColor ?? undefined, goldColor: t.goldColor ?? undefined,
        logoUrl: t.logoUrl ?? undefined, customDomain: t.customDomain ?? undefined,
        profile: (t.profile as any) ?? {},
        // Partner API operator controls — cast because generated Prisma
        // types lag until the pool cycle re-runs `prisma generate`
        // (CLAUDE.md handshake). Columns are live via `prisma db push`.
        partnerMaxApplicantsPerCall: (t as any).partnerMaxApplicantsPerCall ?? 25,
        partnerApiScopes: ((t as any).partnerApiScopes ?? []) as string[],
        counts: { branches: t._count.children, users: t._count.users, operators: t._count.memberships },
        createdAt: t.createdAt.toISOString().slice(0, 10),
      };
    });
  }

  /** All partners / branches the caller can manage (tree list for the Partners page). */
  async listTenants(callerId: string) {
    const scope = await this.callerScope(callerId);
    return tenantContext.runUnscoped(async () => {
      const where: any = { type: { in: ['partner', 'branch'] } };
      if (!scope.superadmin) where.id = { in: [...scope.tenantIds] };
      const rows = await this.prisma.tenant.findMany({
        where, orderBy: [{ type: 'asc' }, { name: 'asc' }],
        include: { parent: { select: { slug: true, name: true } }, _count: { select: { children: true, memberships: true, users: true } } },
      });
      return rows.map((t) => {
        const flags = (t.flags as any) ?? {};
        const profile = (t.profile as any) ?? {};
        return {
          id: t.id, slug: t.slug, name: t.name, type: t.type, status: t.status,
          whitelabel: !!flags.whitelabel, parent: t.parent ?? undefined,
          code: t.code ?? undefined, commissionRate: t.commissionRate != null ? Number(t.commissionRate) : undefined,
          customDomain: t.customDomain ?? undefined,
          applicantType: profile.applicantType ?? undefined,
          city: profile.corrCity ?? profile.city ?? undefined,
          branches: t._count.children, operators: t._count.memberships,
          createdAt: t.createdAt.toISOString().slice(0, 10),
        };
      });
    });
  }

  /** Update a partner/branch's brand + empanelment profile (merges into existing profile). */
  async updateTenant(callerId: string, slug: string, dto: {
    name?: string; status?: string; brandColor?: string; goldColor?: string; logoUrl?: string;
    customDomain?: string; profile?: Record<string, any>; commissionRate?: number | null;
    partnerMaxApplicantsPerCall?: number;
    partnerApiScopes?: string[];
  }) {
    const scope = await this.callerScope(callerId);
    return tenantContext.runUnscoped(async () => {
      const t = await this.prisma.tenant.findUnique({ where: { slug } });
      if (!t) throw new NotFoundException(`Tenant '${slug}' not found`);
      if (!scope.superadmin && !scope.tenantIds.has(t.id)) throw new ForbiddenException('Outside your scope.');
      const data: any = {};
      for (const k of ['name', 'status', 'brandColor', 'goldColor', 'logoUrl'] as const) if (dto[k] !== undefined) data[k] = dto[k];
      if (dto.customDomain !== undefined) data.customDomain = dto.customDomain.trim() || null;
      if (dto.commissionRate !== undefined) data.commissionRate = dto.commissionRate;
      if (dto.profile) data.profile = { ...((t.profile as any) ?? {}), ...dto.profile };
      // Partner API operator controls — the DTO caps values at 1..500 and
      // constrains scopes to strings; the schema also enforces the 500
      // ceiling as a defence in depth (see partner.dto.ts).
      if (dto.partnerMaxApplicantsPerCall !== undefined) data.partnerMaxApplicantsPerCall = dto.partnerMaxApplicantsPerCall;
      if (dto.partnerApiScopes !== undefined) data.partnerApiScopes = dto.partnerApiScopes;
      try {
        await this.prisma.tenant.update({ where: { slug }, data });
      } catch (e: any) {
        if (e?.code === 'P2002') throw new ConflictException('That custom domain is already taken.');
        throw e;
      }
      return { ok: true };
    });
  }

  /* ------------------------------------------------ clients (investors) */

  private kycSummary(statuses: string[]) {
    const verified = statuses.filter((s) => s === 'verified').length;
    return { verified, total: statuses.length };
  }

  /** Investor clients (customers) in the caller's scope; optional tenant filter + free-text search. */
  async listClients(callerId: string, opts: { tenantSlug?: string; q?: string } = {}) {
    const scope = await this.callerScope(callerId);
    return tenantContext.runUnscoped(async () => {
      const where: any = { username: null, mobile: { not: null } }; // customers, not operators
      if (opts.tenantSlug) {
        const t = await this.tenantBySlug(opts.tenantSlug);
        const ids = await this.subtreeIds(t.id);
        if (!scope.superadmin && !ids.some((i) => scope.tenantIds.has(i))) throw new ForbiddenException('Outside your scope.');
        where.tenantId = { in: ids };
      } else if (!scope.superadmin) {
        where.tenantId = { in: [...scope.tenantIds] };
      }
      const q = opts.q?.trim();
      if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { mobile: { contains: q } }, { email: { contains: q, mode: 'insensitive' } }];
      const users = await this.prisma.user.findMany({
        where,
        include: {
          tenant: { select: { slug: true, name: true, type: true } },
          profiles: { select: { kycStatus: true } },
          _count: { select: { profiles: true, applications: true } },
        },
        orderBy: { createdAt: 'desc' }, take: 500,
      });
      return users.map((u) => ({
        id: u.id, name: u.name ?? undefined,
        mobileMasked: u.mobile ? u.mobile.slice(0, 2) + '****' + u.mobile.slice(-4) : undefined,
        email: u.email ?? undefined, status: u.status, tenant: u.tenant,
        profiles: u._count.profiles, applications: u._count.applications,
        kyc: this.kycSummary(u.profiles.map((p) => p.kycStatus)),
        createdAt: u.createdAt.toISOString().slice(0, 10),
      }));
    });
  }

  /** Full client record — KYC profiles (PII masked) + application history. */
  async clientDetail(callerId: string, userId: string) {
    const scope = await this.callerScope(callerId);
    return tenantContext.runUnscoped(async () => {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          tenant: { select: { slug: true, name: true } },
          profiles: { orderBy: { createdAt: 'asc' } },
          applications: { include: { ipo: { select: { symbol: true, name: true } } }, orderBy: { createdAt: 'desc' } },
        },
      });
      if (!u) throw new NotFoundException('Client not found');
      if (!scope.superadmin && !scope.tenantIds.has(u.tenantId)) throw new ForbiddenException('Outside your scope.');
      const profiles = await Promise.all(u.profiles.map(async (p) => {
        let panMasked: string | undefined;
        try { panMasked = this.vault.mask(await this.vault.resolve(p.panTokenRef)); } catch { panMasked = undefined; }
        return {
          id: p.id, fullName: p.fullName, relationship: p.relationship, kycStatus: p.kycStatus,
          depository: p.depository, dpId: p.dpId,
          clientId: p.clientId ? '••••' + p.clientId.slice(-4) : undefined,
          panMasked, ifsc: p.ifsc ?? undefined,
          dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : undefined,
        };
      }));
      return {
        id: u.id, name: u.name ?? undefined, email: u.email ?? undefined,
        mobileMasked: u.mobile ? u.mobile.slice(0, 2) + '****' + u.mobile.slice(-4) : undefined,
        status: u.status, tenant: u.tenant, marketingConsent: u.marketingConsent,
        createdAt: u.createdAt.toISOString().slice(0, 10),
        profiles,
        applications: u.applications.map((a) => ({
          id: a.id, ipoSymbol: a.ipo?.symbol, ipoName: a.ipo?.name, category: a.category,
          lots: a.lots, amount: Number(a.amount), status: a.status,
          allottedLots: a.allottedLots ?? undefined,
          appliedAt: a.createdAt.toISOString().slice(0, 10),
        })),
      };
    });
  }

  /** Create a client shell (mobile + name) on a tenant in scope. Full KYC is added by the customer. */
  async createClient(callerId: string, dto: { mobile: string; name?: string; email?: string; tenantSlug: string }) {
    if (!/^\d{10}$/.test(dto.mobile)) throw new BadRequestException('Enter a valid 10-digit mobile.');
    const scope = await this.callerScope(callerId);
    const tenant = await this.tenantBySlug(dto.tenantSlug);
    if (!scope.superadmin && !scope.tenantIds.has(tenant.id)) throw new ForbiddenException('Outside your scope.');
    return tenantContext.runUnscoped(async () => {
      const existing = await this.prisma.user.findUnique({ where: { mobile: dto.mobile } });
      if (existing) throw new ConflictException('A client with that mobile already exists.');
      const u = await this.prisma.user.create({
        data: { tenantId: tenant.id, mobile: dto.mobile, name: dto.name?.trim() || undefined, email: dto.email?.trim() || undefined, status: 'active' },
      });
      return { id: u.id };
    });
  }

  /**
   * Add a KYC / demat profile for a client (self or family member). PAN + bank + UPI are
   * vaulted; a PAN is unique per tenant (self-PAN rule). Used when an operator onboards a
   * client's own PAN / demat / bank on their behalf.
   */
  async addClientProfile(callerId: string, userId: string, dto: {
    fullName: string; relationship?: string; pan: string; dateOfBirth?: string;
    depository: 'NSDL' | 'CDSL'; dpId: string; clientId: string;
    bankAccount?: string; ifsc?: string; upi?: string;
  }) {
    const scope = await this.callerScope(callerId);
    if (!/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(dto.pan)) throw new BadRequestException('Enter a valid PAN (e.g. ABCDE1234F).');
    if (!['NSDL', 'CDSL'].includes(dto.depository)) throw new BadRequestException('Depository must be NSDL or CDSL.');
    if (!dto.dpId?.trim() || !dto.clientId?.trim()) throw new BadRequestException('DP ID and Client ID are required.');
    return tenantContext.runUnscoped(async () => {
      const u = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!u || u.username) throw new NotFoundException('Client not found');
      if (!scope.superadmin && !scope.tenantIds.has(u.tenantId)) throw new ForbiddenException('Outside your scope.');
      const pan = dto.pan.trim().toUpperCase();
      try {
        const profile = await this.prisma.investorProfile.create({
          data: {
            tenantId: u.tenantId, userId: u.id,
            relationship: (dto.relationship as any) ?? 'self',
            fullName: dto.fullName.trim(),
            panTokenRef: await this.vault.tokenize(pan),
            panHash: this.vault.hash(pan),
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
            depository: dto.depository as any, dpId: dto.dpId.trim(), clientId: dto.clientId.trim(),
            bankTokenRef: dto.bankAccount?.trim() ? await this.vault.tokenize(dto.bankAccount.trim()) : null,
            ifsc: dto.ifsc?.trim() || null,
            upiTokenRef: dto.upi?.trim() ? await this.vault.tokenize(dto.upi.trim()) : null,
          },
        });
        return { id: profile.id };
      } catch (e: any) {
        if (e?.code === 'P2002') throw new ConflictException('That PAN is already registered for this channel.');
        throw e;
      }
    });
  }

  /** Edit a client's contact fields / status. */
  async updateClient(callerId: string, id: string, dto: { name?: string; email?: string; status?: 'active' | 'suspended' }) {
    const scope = await this.callerScope(callerId);
    return tenantContext.runUnscoped(async () => {
      const u = await this.prisma.user.findUnique({ where: { id } });
      if (!u || u.username) throw new NotFoundException('Client not found');
      if (!scope.superadmin && !scope.tenantIds.has(u.tenantId)) throw new ForbiddenException('Outside your scope.');
      const data: any = {};
      if (dto.name !== undefined) data.name = dto.name.trim() || null;
      if (dto.email !== undefined) data.email = dto.email.trim() || null;
      if (dto.status) data.status = dto.status;
      if (Object.keys(data).length) await this.prisma.user.update({ where: { id }, data });
      return { ok: true };
    });
  }

  /** Operator (username) accounts the caller can see. */
  async listOperators(callerId: string) {
    const scope = await this.callerScope(callerId);
    return tenantContext.runUnscoped(async () => {
      const where: any = { username: { not: null } };
      if (!scope.superadmin) where.tenantId = { in: [...scope.tenantIds] };
      const users = await this.prisma.user.findMany({
        where,
        include: { tenant: { select: { slug: true, name: true, type: true } }, memberships: { where: { status: 'active' }, include: { role: true, tenant: { select: { slug: true, name: true } } } } },
        orderBy: { createdAt: 'desc' },
      });
      return users.map((u) => ({
        id: u.id, username: u.username, name: u.name, email: u.email ?? undefined, mobile: u.mobile ?? undefined,
        status: u.status === 'active' ? 'active' : 'inactive', // UI-facing (suspended → inactive)
        tenant: u.tenant,
        roles: u.memberships.map((m) => ({ tenantSlug: m.tenant.slug, tenantName: m.tenant.name, role: m.role.name, scope: m.role.scope })),
        createdAt: u.createdAt.toISOString().slice(0, 10),
      }));
    });
  }

  /** Create an operator user (username+password) on a tenant in the caller's scope. */
  async createOperator(callerId: string, dto: { username: string; name: string; password?: string; tenantSlug: string; roleName: string; email?: string; mobile?: string }) {
    const scope = await this.callerScope(callerId);
    const tenant = await this.tenantBySlug(dto.tenantSlug);
    if (!scope.superadmin && !scope.tenantIds.has(tenant.id)) throw new ForbiddenException('Outside your scope.');
    if (dto.mobile && !/^\d{10}$/.test(dto.mobile)) throw new BadRequestException('Mobile must be 10 digits.');
    const role = await tenantContext.runUnscoped(async () =>
      this.prisma.role.findFirst({ where: { name: dto.roleName, tenantId: { in: [tenant.id, (await this.prisma.tenant.findFirst({ where: { type: 'platform' }, select: { id: true } }))?.id ?? ''] } } }),
    );
    if (!role) throw new NotFoundException(`Role '${dto.roleName}' not found on this tenant.`);
    return tenantContext.runUnscoped(async () => {
      try {
        const password = dto.password?.trim() || this.genPassword();
        const user = await this.prisma.user.create({ data: { tenantId: tenant.id, username: dto.username.trim().toLowerCase(), name: dto.name.trim(), email: dto.email?.trim() || undefined, mobile: dto.mobile?.trim() || undefined, passwordHash: await hashPassword(password), status: 'active' } });
        await this.prisma.membership.create({ data: { userId: user.id, tenantId: tenant.id, roleId: role.id } });
        return { id: user.id, username: user.username, name: user.name, ...(dto.password ? {} : { temporaryPassword: password }) };
      } catch (e: any) {
        if (e?.code === 'P2002') throw new ConflictException(String(e?.meta?.target ?? '').includes('mobile') ? 'That mobile is already registered.' : 'That username is already taken.');
        throw e;
      }
    });
  }

  /** Edit an operator: rename, contact, activate/deactivate, change role, or reset password. */
  async updateOperator(callerId: string, id: string, dto: { name?: string; status?: 'active' | 'inactive'; roleName?: string; password?: string; email?: string; mobile?: string }) {
    const scope = await this.callerScope(callerId);
    if (dto.mobile && !/^\d{10}$/.test(dto.mobile)) throw new BadRequestException('Mobile must be 10 digits.');
    return tenantContext.runUnscoped(async () => {
      const user = await this.prisma.user.findUnique({ where: { id }, include: { memberships: true } });
      if (!user || !user.username) throw new NotFoundException('Operator not found');
      if (!scope.superadmin && !scope.tenantIds.has(user.tenantId)) throw new ForbiddenException('Outside your scope.');
      if (user.username === 'superadmin' && dto.status === 'inactive') throw new BadRequestException('The superadmin cannot be deactivated.');

      const data: any = {};
      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.email !== undefined) data.email = dto.email.trim() || null;
      if (dto.mobile !== undefined) data.mobile = dto.mobile.trim() || null;
      if (dto.status) data.status = dto.status === 'inactive' ? 'suspended' : 'active'; // UserStatus enum
      if (dto.password) data.passwordHash = await hashPassword(dto.password.trim());
      if (Object.keys(data).length) {
        try { await this.prisma.user.update({ where: { id }, data }); }
        catch (e: any) { if (e?.code === 'P2002') throw new ConflictException('That mobile is already registered.'); throw e; }
      }

      if (dto.roleName) {
        const role = await this.prisma.role.findFirst({ where: { name: dto.roleName, tenantId: { in: [user.tenantId, (await this.prisma.tenant.findFirst({ where: { type: 'platform' }, select: { id: true } }))?.id ?? ''] } } });
        if (!role) throw new NotFoundException(`Role '${dto.roleName}' not found.`);
        await this.prisma.membership.upsert({
          where: { userId_tenantId: { userId: id, tenantId: user.tenantId } },
          update: { roleId: role.id, status: 'active' },
          create: { userId: id, tenantId: user.tenantId, roleId: role.id },
        });
      }
      return { ok: true, resetPassword: !!dto.password };
    });
  }

  private memberView(m: any) {
    return {
      membershipId: m.id,
      userId: m.userId,
      mobile: m.user?.mobile,
      name: m.user?.name ?? undefined,
      userStatus: m.user?.status,
      status: m.status,
      isPrimary: m.isPrimary,
      roleId: m.roleId,
      roleName: m.role?.name,
      roleScope: m.role?.scope,
      tenantSlug: m.tenant?.slug,
      tenantName: m.tenant?.name,
      createdAt: m.createdAt.toISOString().slice(0, 10),
    };
  }

  /** Operators of a tenant and its sub-tenants. */
  async listMembers(slug: string) {
    const tenant = await this.tenantBySlug(slug);
    const ids = await this.subtreeIds(tenant.id);
    const rows = await this.prisma.membership.findMany({
      where: { tenantId: { in: ids } },
      include: { user: true, role: true, tenant: { select: { slug: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((m) => this.memberView(m));
  }

  /** Add (or re-role) an operator on a tenant. Creates the user by mobile if new. */
  async addMember(slug: string, dto: { mobile: string; name?: string; roleName: string }) {
    if (!/^\d{10}$/.test(dto.mobile)) throw new BadRequestException('Invalid mobile');
    const tenant = await this.tenantBySlug(slug);
    const role = await this.prisma.role.findFirst({ where: { name: dto.roleName } });
    if (!role) throw new NotFoundException(`Role '${dto.roleName}' not found`);

    return tenantContext.runUnscoped(async () => {
      const user = await this.prisma.user.upsert({
        where: { mobile: dto.mobile },
        update: dto.name ? { name: dto.name } : {},
        create: { mobile: dto.mobile, name: dto.name, tenantId: tenant.id },
      });
      const membership = await this.prisma.membership.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
        update: { roleId: role.id, status: 'active' },
        create: { userId: user.id, tenantId: tenant.id, roleId: role.id },
        include: { user: true, role: true, tenant: { select: { slug: true, name: true } } },
      });
      return this.memberView(membership);
    });
  }

  /** Applications (bids) across a tenant subtree — back-office view. */
  async listApplications(slug: string) {
    const tenant = await this.tenantBySlug(slug);
    const ids = await this.subtreeIds(tenant.id);
    // Applications are RLS-scoped; an operator views across tenants, so read unscoped
    // and filter by the subtree explicitly.
    return tenantContext.runUnscoped(async () => {
      const rows = await this.prisma.application.findMany({
        where: { tenantId: { in: ids } },
        include: {
          ipo: { select: { symbol: true, name: true } },
          profile: { select: { fullName: true } },
          user: { select: { mobile: true } },
          tenant: { select: { slug: true, name: true, code: true, commissionRate: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((a) => {
        const rate = a.tenant?.commissionRate != null ? Number(a.tenant.commissionRate) : 0;
        const allottedAmt = a.allottedAmount != null ? Number(a.allottedAmount) : 0;
        return {
          id: a.id,
          tenantSlug: a.tenant?.slug,
          tenantName: a.tenant?.name,
          partnerCode: a.tenant?.code ?? undefined, // channel code auto-mapped on the bid
          ipoSymbol: a.ipo?.symbol,
          ipoName: a.ipo?.name,
          applicantName: a.profile?.fullName,
          mobileMasked: a.user?.mobile ? a.user.mobile.slice(0, 2) + '****' + a.user.mobile.slice(-4) : undefined,
          category: a.category,
          applicantType: a.applicantType,
          batchId: a.batchId ?? undefined, // family/bulk batches share one id
          lots: a.lots,
          amount: Number(a.amount),
          status: a.status,
          allottedLots: a.allottedLots ?? undefined,
          refundAmount: a.refundAmount != null ? Number(a.refundAmount) : undefined,
          allotmentReason: a.allotmentReason ?? undefined, // registrar's rejection reason
          commissionRate: rate || undefined, // % on this channel
          commissionAmount: Math.round(allottedAmt * rate) / 100, // realized on allotted amount
          appliedAt: a.createdAt.toISOString().slice(0, 10),
        };
      });
    });
  }

  /** Admin home overview — headline counts, live-IPO performance, per-partner & 7-day trends. */
  async dashboard(slug: string) {
    const rep = await this.reports(slug); // scope + application aggregate (runUnscoped inside)
    const tenant = await this.tenantBySlug(slug);
    const ids = await this.subtreeIds(tenant.id);
    const since = new Date(); since.setDate(since.getDate() - 6); since.setHours(0, 0, 0, 0);

    return tenantContext.runUnscoped(async () => {
      const [operators, allIpos, liveIpos, channels, clients, apps7, appAgg] = await Promise.all([
        this.prisma.membership.count({ where: { tenantId: { in: ids }, status: 'active' } }),
        this.prisma.ipo.findMany({ select: { status: true } }),
        this.prisma.ipo.findMany({
          where: { status: 'open' }, orderBy: { closeDate: 'asc' }, take: 8,
          select: {
            symbol: true, name: true, status: true, type: true, priceBandMin: true, priceBandMax: true,
            gmps: { orderBy: { asOf: 'desc' }, take: 1, select: { value: true } },
            subscriptions: { orderBy: { asOf: 'desc' }, take: 1, select: { timesSubscribed: true } },
          },
        }),
        this.prisma.tenant.findMany({ where: { id: { in: ids }, type: { in: ['partner', 'branch'] } }, select: { type: true, status: true } }),
        this.prisma.user.count({ where: { tenantId: { in: ids }, username: null, mobile: { not: null } } }),
        this.prisma.application.findMany({ where: { tenantId: { in: ids }, createdAt: { gte: since } }, select: { createdAt: true } }),
        this.prisma.application.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids } }, _count: { _all: true }, _sum: { amount: true } }),
      ]);

      const iposByStatus: Record<string, number> = {};
      for (const i of allIpos) iposByStatus[i.status] = (iposByStatus[i.status] ?? 0) + 1;

      const partners = channels.filter((t) => t.type === 'partner').length;
      const branches = channels.filter((t) => t.type === 'branch').length;
      const partnerActive = channels.filter((t) => t.status === 'active').length;

      // 7-day application trend (zero-filled)
      const dayMap: Record<string, number> = {};
      for (let d = 0; d < 7; d++) { const dt = new Date(since); dt.setDate(since.getDate() + d); dayMap[dt.toISOString().slice(0, 10)] = 0; }
      for (const a of apps7) { const k = a.createdAt.toISOString().slice(0, 10); if (k in dayMap) dayMap[k]++; }
      const trend7 = Object.entries(dayMap).map(([date, count]) => ({ date, count }));

      // top partners/branches by application volume
      const meta = new Map((await this.prisma.tenant.findMany({ where: { id: { in: appAgg.map((a) => a.tenantId) } }, select: { id: true, name: true, code: true } })).map((t) => [t.id, t]));
      const topPartners = appAgg
        .map((a) => ({ code: meta.get(a.tenantId)?.code ?? '—', name: meta.get(a.tenantId)?.name ?? '—', applications: a._count._all, amount: Number(a._sum.amount ?? 0) }))
        .sort((a, b) => b.applications - a.applications).slice(0, 5);

      return {
        scope: rep.scope,
        counts: {
          tenants: ids.length, operators, partners, branches, clients,
          iposOpen: iposByStatus['open'] ?? 0, iposTotal: allIpos.length,
          iposUpcoming: iposByStatus['upcoming'] ?? 0, iposClosed: (iposByStatus['closed'] ?? 0) + (iposByStatus['listed'] ?? 0),
          applications: rep.totals.applications, amount: rep.totals.amount,
          allotmentRate: rep.allotment.allotmentRate,
          blocked: rep.totals.amount - rep.allotment.totalAllottedAmount,
          refunds: rep.allotment.totalRefund,
        },
        byStatus: rep.totals.byStatus,
        topIpos: rep.byIpo.slice(0, 6),
        topPartners,
        partnerStatus: { active: partnerActive, suspended: channels.length - partnerActive },
        trend7,
        livePerformance: liveIpos.map((i) => ({
          symbol: i.symbol, name: i.name, status: i.status, type: i.type,
          band: i.priceBandMin != null ? `₹${Number(i.priceBandMin)}–${Number(i.priceBandMax)}` : null,
          gmp: i.gmps[0] ? Number(i.gmps[0].value) : null,
          subscription: i.subscriptions[0] ? Number(i.subscriptions[0].timesSubscribed) : null,
        })),
      };
    });
  }

  /** The subtree's applications serialised as CSV (the rows behind the report). */
  async applicationsCsv(slug: string): Promise<string> {
    const rows = await this.listApplications(slug);
    const headers = ['IPO', 'IPO name', 'Applicant', 'Mobile', 'Category', 'Applicant type', 'Lots', 'Amount', 'Status', 'Allotted lots', 'Refund', 'Applied', 'Tenant'];
    const esc = (v: any) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([
        r.ipoSymbol, r.ipoName, r.applicantName, r.mobileMasked, r.category, r.applicantType,
        r.lots, r.amount, r.status, r.allottedLots ?? '', r.refundAmount ?? '', r.appliedAt, r.tenantSlug,
      ].map(esc).join(','));
    }
    return '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8; CRLF line endings
  }

  /** Aggregate bid analytics for a tenant subtree (computed from live applications). */
  async reports(slug: string) {
    const tenant = await this.tenantBySlug(slug);
    const ids = await this.subtreeIds(tenant.id);
    return tenantContext.runUnscoped(async () => {
      const apps = await this.prisma.application.findMany({
        where: { tenantId: { in: ids } },
        include: { ipo: { select: { symbol: true, name: true } } },
      });

      const byStatus: Record<string, number> = {};
      const byIpo = new Map<string, { symbol: string; name: string; applications: number; amount: number; allotted: number }>();
      let amount = 0, allotted = 0, notAllotted = 0, totalRefund = 0, totalAllottedAmount = 0;

      for (const a of apps) {
        byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
        amount += Number(a.amount);
        if (a.status === 'allotted') allotted++;
        else if (a.status === 'not_allotted') notAllotted++;
        totalRefund += a.refundAmount != null ? Number(a.refundAmount) : 0;
        totalAllottedAmount += a.allottedAmount != null ? Number(a.allottedAmount) : 0;

        const key = a.ipoId;
        const row = byIpo.get(key) ?? { symbol: a.ipo?.symbol ?? '—', name: a.ipo?.name ?? '', applications: 0, amount: 0, allotted: 0 };
        row.applications++; row.amount += Number(a.amount);
        if (a.status === 'allotted') row.allotted++;
        byIpo.set(key, row);
      }
      const decided = allotted + notAllotted;

      return {
        scope: { slug: tenant.slug, name: tenant.name },
        totals: { applications: apps.length, amount, byStatus },
        allotment: {
          allotted, notAllotted, pending: apps.length - decided,
          allotmentRate: decided ? Math.round((allotted / decided) * 1000) / 10 : null,
          totalRefund, totalAllottedAmount,
        },
        byIpo: [...byIpo.values()].sort((a, b) => b.amount - a.amount),
      };
    });
  }

  /**
   * Bulk allotment import — the registrar's file as CSV lines of `PAN,allottedLots`.
   * Matches each PAN (via its deterministic hash — raw PANs are never stored) to the
   * IPO's live application and records the allotment through the same path as the
   * single flow (refund math + status event + push notification). Cross-tenant by
   * nature (registrar files span all channels) → runs unscoped like the callbacks.
   * Returns a per-line summary; processing continues past bad lines.
   */
  async importAllotments(
    ipoSymbol: string,
    csv: string,
    recordOne: (applicationId: string, lots: number) => Promise<any>,
  ) {
    const ipo = await this.prisma.ipo.findUnique({ where: { symbol: ipoSymbol.toUpperCase() } });
    if (!ipo) throw new NotFoundException(`IPO '${ipoSymbol}' not found`);

    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      .filter((l, i) => !(i === 0 && /pan/i.test(l) && /lot/i.test(l))); // skip a header row
    let updated = 0;
    const notFound: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const [panRaw, lotsRaw] = lines[i].split(',').map((s) => s?.trim());
      const lineNo = `line ${i + 1}`;
      if (!panRaw || !/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(panRaw)) { errors.push(`${lineNo}: invalid PAN`); continue; }
      const lots = Number(lotsRaw);
      if (!Number.isInteger(lots) || lots < 0) { errors.push(`${lineNo}: invalid lots '${lotsRaw}'`); continue; }

      const panHash = this.vault.hash(panRaw);
      const app = await tenantContext.runUnscoped(async () =>
        this.prisma.application.findFirst({
          where: { ipoId: ipo.id, profile: { panHash }, status: { notIn: ['draft', 'failed', 'rejected'] } },
          select: { id: true },
        }),
      );
      if (!app) { notFound.push(`${lineNo}: ${this.vault.mask(panRaw)}`); continue; }
      try {
        await recordOne(app.id, lots);
        updated++;
      } catch (e: any) {
        errors.push(`${lineNo}: ${String(e?.message ?? e).slice(0, 80)}`);
      }
    }
    return { ipo: ipo.symbol, lines: lines.length, updated, notFound, errors };
  }

  /** Change a membership's role and/or active status (must belong to the tenant subtree). */
  async updateMember(slug: string, membershipId: string, patch: { roleName?: string; status?: 'active' | 'inactive' }) {
    const tenant = await this.tenantBySlug(slug);
    const ids = await this.subtreeIds(tenant.id);
    const existing = await this.prisma.membership.findUnique({ where: { id: membershipId } });
    if (!existing || !ids.includes(existing.tenantId)) throw new NotFoundException('Membership not found in this scope');

    const data: any = {};
    if (patch.status) data.status = patch.status;
    if (patch.roleName) {
      const role = await this.prisma.role.findFirst({ where: { name: patch.roleName } });
      if (!role) throw new NotFoundException(`Role '${patch.roleName}' not found`);
      data.roleId = role.id;
    }
    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data,
      include: { user: true, role: true, tenant: { select: { slug: true, name: true } } },
    });
    return this.memberView(updated);
  }
}
