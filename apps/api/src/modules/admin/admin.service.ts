import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { RailService } from '../rail/rail.service';
import { HealthService } from '../health/health.module';
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
  constructor(private prisma: PrismaService, private vault: PiiVaultService, private health: HealthService, private rail: RailService) {}

  /** Operator-facing system/infra status (component health + configured modes). */
  async systemStatus() {
    const [database, redis] = await Promise.all([this.health.database(), this.health.redisState()]);
    return {
      database,
      redis,
      queue: process.env.REDIS_URL ? 'BullMQ (Redis)' : 'inline (dev)',
      sms: process.env.SMS_PROVIDER ? `provider: ${process.env.SMS_PROVIDER}` : 'dev (logged)',
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
      baseUrl: c.baseUrl, env: c.env, active: c.active,
      passwordSet: !!c.passwordRef, ibbsIdSet: !!c.ibbsIdRef,
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
        subBrokerCode: dto.subBrokerCode ?? null, baseUrl: dto.baseUrl, env: dto.env, active: dto.active ?? true,
      },
    });
    return { id: cred.id };
  }

  async updateRail(id: string, dto: any) {
    const existing = await this.prisma.memberCredential.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Credential not found');
    const data: any = {};
    for (const k of ['memberName', 'memberType', 'loginId', 'memberCode', 'subBrokerCode', 'baseUrl', 'env', 'active', 'exchange']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.password) data.passwordRef = await this.vault.tokenize(dto.password);  // re-set secret
    if (dto.ibbsId !== undefined) data.ibbsIdRef = dto.ibbsId ? await this.vault.tokenize(dto.ibbsId) : null;
    await this.prisma.memberCredential.update({ where: { id }, data });
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

  /** Edit a custom role's scope/permissions (system roles are immutable). */
  async updateRole(id: string, dto: { scope?: string; permissions?: string[] }) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('System roles cannot be edited.');
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
          tenant: { select: { slug: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((a) => ({
        id: a.id,
        tenantSlug: a.tenant?.slug,
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
        appliedAt: a.createdAt.toISOString().slice(0, 10),
      }));
    });
  }

  /** Admin home overview — headline counts + application aggregate + open IPOs. */
  async dashboard(slug: string) {
    const rep = await this.reports(slug); // scope + application aggregate (runUnscoped inside)
    const tenant = await this.tenantBySlug(slug);
    const ids = await this.subtreeIds(tenant.id);
    const [operators, allIpos, openIpos] = await Promise.all([
      this.prisma.membership.count({ where: { tenantId: { in: ids }, status: 'active' } }),
      this.prisma.ipo.findMany({ select: { status: true } }),
      this.prisma.ipo.findMany({
        where: { status: { in: ['open', 'upcoming'] } },
        orderBy: { closeDate: 'asc' }, take: 6,
        select: { symbol: true, name: true, status: true, type: true, closeDate: true, priceBandMin: true, priceBandMax: true },
      }),
    ]);
    const iposOpen = allIpos.filter((i) => i.status === 'open').length;
    return {
      scope: rep.scope,
      counts: {
        tenants: ids.length,
        operators,
        iposOpen,
        iposTotal: allIpos.length,
        applications: rep.totals.applications,
        amount: rep.totals.amount,
        allotmentRate: rep.allotment.allotmentRate,
        blocked: rep.totals.amount - rep.allotment.totalAllottedAmount, // applied but not yet allotted/refunded
      },
      byStatus: rep.totals.byStatus,
      topIpos: rep.byIpo.slice(0, 6),
      openIpos: openIpos.map((i) => ({
        symbol: i.symbol, name: i.name, status: i.status, type: i.type,
        closeDate: i.closeDate ? i.closeDate.toISOString().slice(0, 10) : null,
        band: i.priceBandMin != null ? `₹${Number(i.priceBandMin)}–${Number(i.priceBandMax)}` : null,
      })),
    };
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
