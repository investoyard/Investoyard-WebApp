import {
  BadRequestException, Body, Controller, Get, Injectable, Logger, Module, NotFoundException,
  Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { EmailService } from '../../common/email.service';
import { ProviderConfigModule } from '../../common/provider-config.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { tenantContext } from '../../common/tenant-context';
import { AdminModule } from '../admin/admin.module';
import { AdminService } from '../admin/admin.service';

const scrypt = promisify(_scrypt) as (p: string, s: string, k: number) => Promise<Buffer>;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const KINDS = ['partner', 'whitelabel', 'branch'] as const;

interface ApplyDto {
  kind?: string; contactName?: string; email?: string;
  entityType?: string; legalName?: string; pan?: string; gstin?: string;
  city?: string; state?: string; sebiRegNo?: string; arn?: string; notes?: string;
  documents?: { type: string; url: string; name?: string }[];
}

/**
 * Partner self-onboarding.
 *
 * Applications are stored on their own, NOT as pending tenants — a half-real
 * tenant would surface in the tenant tree, settings cascade, RLS scoping and
 * reports. Approval calls the operator's existing registerTenant() path, so the
 * channel code, admin user and role are created exactly as they always were.
 *
 * Nothing here grants access: the applicant supplies information, the operator
 * decides the tenant type, and the login only exists after approval. Deliberately
 * a SHORT form — the full JM/Nuvama empanelment profile is collected afterwards,
 * so we only do the heavy data collection for partners we've accepted.
 */
@Injectable()
export class PartnerOnboardingService {
  private readonly log = new Logger('PartnerOnboarding');

  constructor(
    private prisma: PrismaService,
    private vault: PiiVaultService,
    private email: EmailService,
    private admin: AdminService,
  ) {}

  private slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'partner';
  }

  /** Submit (or replace an un-reviewed submission from the same account). */
  async apply(userId: string, mobile: string, dto: ApplyDto) {
    const legalName = (dto.legalName ?? '').trim();
    const contactName = (dto.contactName ?? '').trim();
    const email = (dto.email ?? '').trim().toLowerCase();
    const kind = KINDS.includes(dto.kind as any) ? dto.kind! : 'partner';
    const problems: string[] = [];
    if (!legalName) problems.push('Business name');
    if (!contactName) problems.push('Contact name');
    if (!/^\S+@\S+\.\S+$/.test(email)) problems.push('Email');
    const pan = (dto.pan ?? '').trim().toUpperCase();
    if (pan && !PAN_RE.test(pan)) problems.push('PAN (format ABCDE1234F)');
    if (problems.length) throw new BadRequestException(`Please check: ${problems.join(', ')}`);

    // one live application per account — a decided one is kept for the record
    const existing = await this.prisma.partnerApplication.findFirst({
      where: { userId, status: { in: ['submitted', 'changes_requested'] } },
    });

    const data = {
      userId, mobile, email, contactName, kind,
      entityType: dto.entityType || null,
      legalName,
      panTokenRef: pan ? await this.vault.tokenize(pan) : null,
      panMasked: pan ? this.vault.mask(pan) : null,
      gstin: (dto.gstin ?? '').trim().toUpperCase() || null,
      city: (dto.city ?? '').trim() || null,
      state: (dto.state ?? '').trim() || null,
      sebiRegNo: (dto.sebiRegNo ?? '').trim() || null,
      arn: (dto.arn ?? '').trim() || null,
      notes: (dto.notes ?? '').trim() || null,
      documents: (dto.documents ?? []) as any,
      status: 'submitted',
      reviewNote: null,
    };

    const row = existing
      ? await this.prisma.partnerApplication.update({ where: { id: existing.id }, data })
      : await this.prisma.partnerApplication.create({ data });
    this.log.log(`application ${row.id} submitted by ${mobile} (${legalName})`);
    return { id: row.id, status: row.status };
  }

  /** The applicant's own application — drives the status page. */
  async mine(userId: string) {
    const row = await this.prisma.partnerApplication.findFirst({
      where: { userId }, orderBy: { createdAt: 'desc' },
    });
    if (!row) return null;
    return {
      id: row.id, status: row.status, kind: row.kind, legalName: row.legalName,
      contactName: row.contactName, email: row.email,
      entityType: row.entityType, gstin: row.gstin, city: row.city, state: row.state,
      sebiRegNo: row.sebiRegNo, arn: row.arn, notes: row.notes,
      panMasked: row.panMasked, documents: row.documents ?? [],
      reviewNote: row.reviewNote, createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    };
  }

  /* ── operator side ── */

  async list(status?: string) {
    const rows = await this.prisma.partnerApplication.findMany({
      where: status && status !== 'all' ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return (rows as any[]).map((r) => ({
      id: r.id, status: r.status, kind: r.kind, legalName: r.legalName,
      contactName: r.contactName, mobile: r.mobile, email: r.email,
      city: r.city, state: r.state, entityType: r.entityType,
      createdAt: r.createdAt.toISOString(), reviewedAt: r.reviewedAt?.toISOString() ?? null,
      tenantId: r.tenantId,
    }));
  }

  /** Full record for review — resolves the vaulted PAN for the operator only. */
  async detail(id: string) {
    const r = await this.prisma.partnerApplication.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Application not found.');
    let pan: string | null = null;
    if (r.panTokenRef) { try { pan = await this.vault.resolve(r.panTokenRef); } catch { pan = null; } }
    return {
      id: r.id, status: r.status, kind: r.kind,
      legalName: r.legalName, contactName: r.contactName, mobile: r.mobile, email: r.email,
      entityType: r.entityType, pan, gstin: r.gstin, city: r.city, state: r.state,
      sebiRegNo: r.sebiRegNo, arn: r.arn, notes: r.notes,
      documents: (r.documents as any) ?? [],
      reviewNote: r.reviewNote, reviewedAt: r.reviewedAt?.toISOString() ?? null,
      tenantId: r.tenantId,
      inviteToken: r.inviteToken, inviteExpires: r.inviteExpires?.toISOString() ?? null,
      activatedAt: r.activatedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async requestChanges(id: string, note: string, reviewerId: string) {
    if (!note?.trim()) throw new BadRequestException('Tell the applicant what to change.');
    await this.prisma.partnerApplication.update({
      where: { id },
      data: { status: 'changes_requested', reviewNote: note.trim(), reviewedBy: reviewerId, reviewedAt: new Date() },
    });
    return { ok: true };
  }

  async reject(id: string, note: string, reviewerId: string) {
    await this.prisma.partnerApplication.update({
      where: { id },
      data: { status: 'rejected', reviewNote: note?.trim() || null, reviewedBy: reviewerId, reviewedAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Approve → create the tenant through the normal path, then email an
   * activation link. The link is ALSO returned so the operator can send it
   * manually when SMTP isn't configured (dev fallback logs instead of sending).
   */
  async approve(id: string, reviewerId: string, opts: { kind?: string; slug?: string; parentSlug?: string; baseUrl?: string }) {
    const app = await this.prisma.partnerApplication.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('Application not found.');
    if (app.status === 'approved') throw new BadRequestException('Already approved.');

    const kind = (KINDS.includes(opts.kind as any) ? opts.kind : app.kind) as 'partner' | 'whitelabel' | 'branch';
    // A branch must hang off a partner — registerTenant rejects it otherwise.
    if (kind === 'branch' && !opts.parentSlug) throw new BadRequestException('Choose the parent partner for this branch.');
    let slug = this.slugify(opts.slug || app.legalName);
    // slugs are unique — walk a suffix rather than failing the approval
    for (let n = 2; await this.prisma.tenant.findUnique({ where: { slug } }); n++) {
      slug = `${this.slugify(opts.slug || app.legalName)}-${n}`;
      if (n > 50) throw new BadRequestException('Could not derive a free slug — set one manually.');
    }

    const username = `${slug}-admin`.slice(0, 40);
    const tempPassword = randomBytes(12).toString('base64url');
    const created = await this.admin.registerTenant(reviewerId, {
      kind, name: app.legalName, slug, parentSlug: opts.parentSlug,
      adminName: app.contactName, adminUsername: username, adminPassword: tempPassword,
      profile: {
        source: 'self-onboarding', applicationId: app.id,
        entityType: app.entityType, gstin: app.gstin, city: app.city, state: app.state,
        sebiRegNo: app.sebiRegNo, arn: app.arn, contactEmail: app.email, contactMobile: app.mobile,
        documents: app.documents ?? [],
      },
    });

    const token = randomBytes(24).toString('base64url');
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const tenant = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true, code: true } });
    await this.prisma.partnerApplication.update({
      where: { id },
      data: {
        status: 'approved', reviewedBy: reviewerId, reviewedAt: new Date(),
        tenantId: tenant?.id ?? null, inviteToken: token, inviteExpires: expires, reviewNote: null,
      },
    });

    const base = (opts.baseUrl || process.env.WEB_BASE_URL || 'https://newipo.finwave.co').replace(/\/$/, '');
    const link = `${base}/partner/activate?token=${token}`;
    const mail = await this.email.send({
      to: app.email,
      subject: 'Your Investoyard partner account is approved',
      text: `Dear ${app.contactName},\n\nYour partner application for ${app.legalName} has been approved.\n\nSet your password and sign in: ${link}\n\nThis link is valid for 7 days.\n\n— Investoyard`,
      html: `<p>Dear ${app.contactName},</p><p>Your partner application for <b>${app.legalName}</b> has been approved.</p>`
        + `<p><a href="${link}">Set your password and sign in</a></p><p>This link is valid for 7 days.</p><p>— Investoyard</p>`,
    }).catch((e) => ({ sent: false, error: String(e?.message ?? e) } as any));

    this.log.log(`application ${id} approved → tenant ${slug} (${tenant?.code ?? '?'}), email sent=${(mail as any).sent}`);
    return {
      ok: true, slug, code: tenant?.code ?? null, username,
      activationLink: link,                    // always returned so approval never silently fails
      emailSent: !!(mail as any).sent,
      emailDev: !!(mail as any).dev,
    };
  }

  /** Applicant sets their password from the emailed link. Single use. */
  async activate(token: string, password: string) {
    if (!token) throw new BadRequestException('Missing activation token.');
    if (!password || password.length < 8) throw new BadRequestException('Choose a password of at least 8 characters.');
    const app = await this.prisma.partnerApplication.findUnique({ where: { inviteToken: token } });
    if (!app || app.status !== 'approved') throw new BadRequestException('This activation link is not valid.');
    if (app.activatedAt) throw new BadRequestException('This link has already been used.');
    if (app.inviteExpires && app.inviteExpires < new Date()) throw new BadRequestException('This link has expired — ask the operator to resend it.');
    if (!app.tenantId) throw new BadRequestException('Account is not ready yet.');

    const admin = await tenantContext.runUnscoped(() => this.prisma.user.findFirst({
      where: { tenantId: app.tenantId!, username: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, username: true },
    }));
    if (!admin) throw new BadRequestException('Account is not ready yet.');

    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(password, salt, 64)).toString('hex');
    await tenantContext.runUnscoped(() => this.prisma.user.update({
      where: { id: admin.id }, data: { passwordHash: `${salt}:${hash}` },
    }));
    await this.prisma.partnerApplication.update({
      where: { id: app.id }, data: { activatedAt: new Date(), inviteToken: null },
    });
    return { ok: true, username: admin.username };
  }
}

/** Applicant-facing: submit and track. Auth = the ordinary OTP session. */
@Controller('partner-apply')
@UseGuards(JwtAuthGuard)
export class PartnerApplyController {
  constructor(private readonly svc: PartnerOnboardingService) {}

  @Post()
  apply(@Req() req: any, @Body() dto: ApplyDto) {
    return this.svc.apply(req.user.sub, req.user.mobile ?? '', dto);
  }

  @Get('mine')
  mine(@Req() req: any) {
    return this.svc.mine(req.user.sub);
  }
}

/** Public: complete activation from the emailed link (no session yet). */
@Controller('partner-activate')
export class PartnerActivateController {
  constructor(private readonly svc: PartnerOnboardingService) {}

  @Post()
  activate(@Body() body: { token?: string; password?: string }) {
    return this.svc.activate(body?.token ?? '', body?.password ?? '');
  }
}

/** Operator review queue. */
@Controller('admin/partner-applications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PartnerApplicationsController {
  constructor(private readonly svc: PartnerOnboardingService) {}

  @Get()
  @RequirePermissions('tenants.manage')
  list(@Query('status') status?: string) {
    return this.svc.list(status);
  }

  @Get(':id')
  @RequirePermissions('tenants.manage')
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Post(':id/approve')
  @RequirePermissions('tenants.manage')
  approve(@Req() req: any, @Param('id') id: string, @Body() body: { kind?: string; slug?: string; parentSlug?: string; baseUrl?: string }) {
    return this.svc.approve(id, req.user.sub, body ?? {});
  }

  @Post(':id/changes')
  @RequirePermissions('tenants.manage')
  changes(@Req() req: any, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.svc.requestChanges(id, body?.note ?? '', req.user.sub);
  }

  @Post(':id/reject')
  @RequirePermissions('tenants.manage')
  reject(@Req() req: any, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.svc.reject(id, body?.note ?? '', req.user.sub);
  }
}

@Module({
  imports: [ProviderConfigModule, JwtModule.register({}), AdminModule],
  controllers: [PartnerApplyController, PartnerActivateController, PartnerApplicationsController],
  providers: [PartnerOnboardingService, PrismaService, PiiVaultService, EmailService, JwtAuthGuard, PermissionsGuard],
})
export class PartnerOnboardingModule {}
