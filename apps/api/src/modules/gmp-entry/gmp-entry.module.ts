import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable,
  Module, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { tenantContext } from '../../common/tenant-context';

interface GmpEntryDto { entries?: { ipoId?: string; value?: number | string; trend?: string }[] }

/**
 * GMP entry for people who are NOT admins.
 *
 * GMP moves investor behaviour and we publish it site-wide, so writing it is
 * authorised two ways and always attributed:
 *   · an operator whose role carries `gmp.submit` (admin, staff, …), or
 *   · a user on the GmpContributor allow-list, who needs no admin access at all.
 * Saving publishes immediately (operator decision) and the latest value wins;
 * every write records who made it and appends to the day-wise `extra.gmpLog`.
 */
@Injectable()
export class GmpEntryService {
  constructor(private prisma: PrismaService) {}

  /** Contributor OR an operator role granting `gmp.submit`. Throws otherwise. */
  async assertMaySubmit(userId: string): Promise<{ name: string }> {
    const [user, contributor, memberships] = await Promise.all([
      tenantContext.runUnscoped(() => this.prisma.user.findUnique({
        where: { id: userId }, select: { name: true, mobile: true, username: true },
      })),
      this.prisma.gmpContributor.findUnique({ where: { userId } }),
      this.prisma.membership.findMany({ where: { userId, status: 'active' }, include: { role: true } }),
    ]);
    if (!user) throw new ForbiddenException('Not authenticated.');
    const viaRole = (memberships as any[]).some((m) => {
      const p: string[] = m?.role?.permissions ?? [];
      return p.includes('gmp.submit') || p.includes('*');
    });
    if (!(contributor?.active || viaRole)) {
      throw new ForbiddenException('You are not authorised to enter GMP. Ask the operator for access.');
    }
    return { name: user.name || user.username || user.mobile || 'User' };
  }

  /** Open + upcoming IPOs with whatever GMP is currently published. */
  async board() {
    const rows = await this.prisma.ipo.findMany({
      where: { hidden: false, status: { in: ['open', 'upcoming'] as any } },
      orderBy: [{ status: 'asc' }, { closeDate: 'asc' }],
      select: {
        id: true, symbol: true, name: true, type: true, status: true, logoUrl: true,
        priceBandMin: true, priceBandMax: true, openDate: true, closeDate: true,
        gmps: { orderBy: { asOf: 'desc' }, take: 1 },
      },
    });
    return rows.map((i) => {
      const g = i.gmps[0];
      return {
        id: i.id, symbol: i.symbol, name: i.name, type: i.type, status: i.status, logoUrl: i.logoUrl,
        priceBandMin: i.priceBandMin != null ? Number(i.priceBandMin) : undefined,
        priceBandMax: i.priceBandMax != null ? Number(i.priceBandMax) : undefined,
        openDate: i.openDate?.toISOString().slice(0, 10),
        closeDate: i.closeDate?.toISOString().slice(0, 10),
        currentGmp: g ? Number(g.value) : null,
        currentBy: g?.submittedByName ?? null,
        currentAt: g?.asOf?.toISOString() ?? null,
      };
    });
  }

  /** Publish one or more GMP values. Latest wins; every write is attributed. */
  async submit(userId: string, dto: GmpEntryDto) {
    const who = await this.assertMaySubmit(userId);
    const entries = (dto.entries ?? []).filter((e) => e?.ipoId != null && e.value !== '' && e.value != null);
    if (entries.length === 0) throw new BadRequestException('Nothing to save.');

    const day = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    let saved = 0;
    const errors: string[] = [];

    for (const e of entries) {
      const value = Number(e.value);
      if (!Number.isFinite(value)) { errors.push(`${e.ipoId}: not a number`); continue; }
      if (Math.abs(value) > 100_000) { errors.push(`${e.ipoId}: out of range`); continue; }
      const ipo = await this.prisma.ipo.findUnique({ where: { id: String(e.ipoId) } });
      if (!ipo) { errors.push(`${e.ipoId}: IPO not found`); continue; }

      const band = Number(ipo.priceBandMax ?? ipo.priceBandMin ?? 0);
      const pct = band > 0 ? Math.round((value / band) * 1000) / 10 : null;

      // day-wise log drives the trend charts — one entry per day, latest wins
      const extra: Record<string, any> = { ...((ipo.extra as any) ?? {}) };
      const log = Array.isArray(extra.gmpLog) ? extra.gmpLog : [];
      extra.gmpLog = [...log.filter((x: any) => x?.d !== day), { d: day, gmp: value, pct }].slice(-30);

      await this.prisma.$transaction([
        this.prisma.ipoGmp.create({
          data: {
            ipoId: ipo.id, value, trend: e.trend || undefined,
            source: 'contributor', submittedBy: userId, submittedByName: who.name,
          },
        }),
        this.prisma.ipo.update({ where: { id: ipo.id }, data: { extra: extra as any } }),
      ]);
      saved++;
    }
    return { saved, errors };
  }

  /** Admin audit view — who entered what, newest first. */
  async log(limit = 100) {
    const rows = await this.prisma.ipoGmp.findMany({
      orderBy: { asOf: 'desc' },
      take: Math.min(Math.max(1, limit), 500),
      include: { ipo: { select: { symbol: true, name: true } } },
    });
    return rows.map((r) => ({
      id: r.id, symbol: r.ipo?.symbol, name: r.ipo?.name,
      value: Number(r.value), source: r.source ?? null,
      by: r.submittedByName ?? null, byId: r.submittedBy ?? null,
      at: r.asOf.toISOString(),
    }));
  }

  async listContributors() {
    const rows: any[] = await this.prisma.gmpContributor.findMany({ orderBy: { createdAt: 'desc' } });
    const users = await tenantContext.runUnscoped(() => this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: { id: true, name: true, mobile: true, username: true },
    }));
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      id: r.id, userId: r.userId, active: r.active, note: r.note ?? null,
      createdAt: r.createdAt.toISOString(),
      name: byId.get(r.userId)?.name ?? null,
      mobile: byId.get(r.userId)?.mobile ?? byId.get(r.userId)?.username ?? null,
    }));
  }

  /** Add by mobile — the person must already have an account (OTP login). */
  async addContributor(mobile: string, note: string | undefined, addedBy: string) {
    const clean = (mobile ?? '').replace(/\D/g, '').slice(-10);
    if (clean.length !== 10) throw new BadRequestException('Enter a 10-digit mobile number.');
    const user = await tenantContext.runUnscoped(() =>
      this.prisma.user.findFirst({ where: { mobile: clean }, select: { id: true } }));
    if (!user) throw new BadRequestException(`No account for ${clean} — ask them to sign in once, then add them.`);
    await this.prisma.gmpContributor.upsert({
      where: { userId: user.id },
      create: { userId: user.id, note, addedBy, active: true },
      update: { active: true, note },
    });
    return { added: true };
  }

  async removeContributor(id: string) {
    await this.prisma.gmpContributor.delete({ where: { id } }).catch(() => undefined);
    return { removed: true };
  }
}

/** Non-admin surface: the entry board itself. Authorisation is per-user, not per-role. */
@Controller('gmp-entry')
@UseGuards(JwtAuthGuard)
export class GmpEntryController {
  constructor(private readonly svc: GmpEntryService) {}

  /** Tells the client whether to show the screen at all. */
  @Get('access')
  async access(@Req() req: any) {
    try { await this.svc.assertMaySubmit(req.user.sub); return { allowed: true }; }
    catch { return { allowed: false }; }
  }

  @Get('board')
  async board(@Req() req: any) {
    await this.svc.assertMaySubmit(req.user.sub);
    return this.svc.board();
  }

  @Post()
  submit(@Req() req: any, @Body() dto: GmpEntryDto) {
    return this.svc.submit(req.user.sub, dto);
  }
}

/** Admin surface: the audit log and the contributor allow-list. */
@Controller('admin/gmp')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GmpAdminController {
  constructor(private readonly svc: GmpEntryService) {}

  @Get('log')
  @RequirePermissions('ipos.view')
  log(@Query('limit') limit?: string) {
    return this.svc.log(limit ? Number(limit) : undefined);
  }

  @Get('contributors')
  @RequirePermissions('ipos.manage')
  contributors() {
    return this.svc.listContributors();
  }

  @Post('contributors')
  @RequirePermissions('ipos.manage')
  add(@Req() req: any, @Body() body: { mobile?: string; note?: string }) {
    return this.svc.addContributor(body?.mobile ?? '', body?.note, req.user.sub);
  }

  @Delete('contributors/:id')
  @RequirePermissions('ipos.manage')
  remove(@Param('id') id: string) {
    return this.svc.removeContributor(id);
  }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [GmpEntryController, GmpAdminController],
  providers: [GmpEntryService, PrismaService, JwtAuthGuard, PermissionsGuard],
})
export class GmpEntryModule {}
