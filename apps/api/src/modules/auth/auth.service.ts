import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../../common/messaging.service';
import { RedisService } from '../../common/redis.service';
import { verifyPassword } from '../../common/password';
import { tenantContext } from '../../common/tenant-context';

const DEV_OTP = '123456';      // accepted only when SMS delivery is not configured
const OTP_TTL = 5 * 60;        // seconds
const RL_MAX = 5;              // max OTP requests per mobile per hour
const RL_COOLDOWN = 30;        // seconds between requests for a mobile

interface OtpRec { mobile: string; otp: string; exp: number }

/**
 * OTP auth (Tier 1). A real 6-digit OTP is generated and sent via SmsService; in
 * DEV (no SMS provider) it's logged and 123456 is also accepted. The pending OTP
 * store and request rate-limits live in Redis (survive restarts, work across API
 * instances); without REDIS_URL they fall back to in-memory (dev, single instance).
 */
@Injectable()
export class AuthService {
  private mem = new Map<string, OtpRec>(); // fallback when Redis is absent

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private messaging: MessagingService,
    private redis: RedisService,
  ) {}

  /**
   * Compliance audit trail (SEBI/exchange record-keeping): every OTP request,
   * verify success/failure and operator login lands in AuditLog with timestamp
   * and client IP. Fire-and-forget — auditing must never block or fail auth.
   * The OTP value itself is NEVER logged.
   */
  private audit(action: string, data: { actorId?: string | null; mobile?: string | null; label?: string | null; detail?: Record<string, any> }) {
    this.prisma.auditLog
      .create({
        data: {
          actorId: data.actorId ?? null,
          actorMobile: data.mobile ?? null,
          action,
          targetType: 'auth',
          targetLabel: data.label ?? null,
          detail: data.detail ?? undefined,
        },
      })
      .catch(() => { /* never block auth on audit */ });
  }

  private async storeOtp(rid: string, rec: OtpRec) {
    if (this.redis.client) await this.redis.client.set(`otp:${rid}`, JSON.stringify(rec), 'EX', OTP_TTL);
    else this.mem.set(rid, rec);
  }
  private async readOtp(rid: string): Promise<OtpRec | null> {
    if (this.redis.client) { const v = await this.redis.client.get(`otp:${rid}`); return v ? JSON.parse(v) : null; }
    return this.mem.get(rid) ?? null;
  }
  private async dropOtp(rid: string) {
    if (this.redis.client) await this.redis.client.del(`otp:${rid}`);
    else this.mem.delete(rid);
  }

  /** Throttle OTP requests per mobile (cooldown + hourly cap). Only when real SMS is
   *  configured — dev logs OTPs (no cost/bombing risk) and stays unthrottled. */
  private async rateLimit(mobile: string) {
    if (!this.redis.client || !(await this.messaging.smsEnabled(tenantContext.tenantId() ?? undefined))) return;
    const cd = await this.redis.client.set(`otp:cd:${mobile}`, '1', 'EX', RL_COOLDOWN, 'NX');
    if (cd === null) throw new HttpException('Please wait before requesting another OTP.', HttpStatus.TOO_MANY_REQUESTS);
    const n = await this.redis.client.incr(`otp:rl:${mobile}`);
    if (n === 1) await this.redis.client.expire(`otp:rl:${mobile}`, 3600);
    if (n > RL_MAX) throw new HttpException('Too many OTP requests. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }

  async requestOtp(mobile: string, ip?: string): Promise<{ requestId: string }> {
    if (!/^\d{10}$/.test(mobile)) throw new BadRequestException('Invalid mobile');
    await this.rateLimit(mobile);
    const requestId = randomBytes(16).toString('hex');
    const otp = String(randomInt(100000, 1000000)); // real 6-digit code
    await this.storeOtp(requestId, { mobile, otp, exp: Date.now() + OTP_TTL * 1000 });
    // Resolves the inbound tenant's SMS provider + 'otp' template (white-label uses its own).
    await this.messaging.sendSms('otp', mobile, { tenantId: tenantContext.tenantId() ?? undefined, vars: { otp } });
    this.audit('auth.otp.request', { mobile, detail: { requestId, ip, tenantId: tenantContext.tenantId() ?? undefined } });
    return { requestId };
  }

  async verifyOtp(requestId: string, otp: string, ip?: string) {
    const rec = await this.readOtp(requestId);
    if (!rec || rec.exp < Date.now()) {
      this.audit('auth.otp.expired', { mobile: rec?.mobile ?? null, detail: { requestId, ip } });
      throw new BadRequestException('OTP expired');
    }
    const devBypass = !(await this.messaging.smsEnabled(tenantContext.tenantId() ?? undefined)) && otp === DEV_OTP;
    if (rec.otp !== otp && !devBypass) {
      this.audit('auth.otp.fail', { mobile: rec.mobile, detail: { requestId, ip } });
      throw new BadRequestException('Invalid OTP');
    }
    await this.dropOtp(requestId);

    // Login is tenant-AGNOSTIC: a user is identified by their globally-unique mobile,
    // and their home tenant isn't known until we find them. So resolve the user with
    // NO tenant scope (else RLS, set to the inbound brand, would hide users whose home
    // tenant differs — e.g. an operator admin signing in from the default door).
    // New users are stamped with the inbound tenant (resolved by TenantMiddleware).
    const inboundTenant = tenantContext.requireTenantId();
    const user = await tenantContext.runUnscoped(async () => {
      const u = await this.prisma.user.upsert({
        where: { mobile: rec.mobile },
        update: {},
        create: { mobile: rec.mobile, tenantId: inboundTenant },
      });
      return u.tenantId ? u : this.prisma.user.update({ where: { id: u.id }, data: { tenantId: inboundTenant } });
    });

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, mobile: user.mobile, tenant: user.tenantId ?? undefined },
      { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES_IN ?? '30d' },
    );
    this.audit('auth.otp.verify', { actorId: user.id, mobile: user.mobile, detail: { requestId, ip, devBypass: devBypass || undefined } });
    return { accessToken, user: { id: user.id, mobile: user.mobile, name: user.name, tenantId: user.tenantId } };
  }

  /**
   * Operator login (superadmin / partner / branch) — username + password. Tenant-
   * agnostic lookup (operators' home tenant varies); issues the same JWT shape as
   * the OTP flow so JwtAuthGuard + PermissionsGuard work identically.
   */
  async operatorLogin(username: string, password: string, ip?: string) {
    const uname = (username ?? '').trim().toLowerCase();
    const user = await tenantContext.runUnscoped(async () =>
      this.prisma.user.findUnique({ where: { username: uname } }),
    );
    if (!user || user.status !== 'active' || !(await verifyPassword(password, user.passwordHash))) {
      this.audit('auth.operator.fail', { label: uname, detail: { ip } });
      throw new UnauthorizedException('Invalid username or password');
    }
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, username: user.username, tenant: user.tenantId ?? undefined },
      { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES_IN ?? '30d' },
    );
    this.audit('auth.operator.login', { actorId: user.id, label: user.username ?? uname, detail: { ip } });
    return { accessToken, user: { id: user.id, username: user.username, name: user.name, tenantId: user.tenantId } };
  }

  /** The logged-in operator's identity + effective permissions (drives the admin UI). */
  async me(userId: string) {
    return tenantContext.runUnscoped(async () => {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        // homeTenant includes id so the client can key API-scoped calls
        // (partner-key list/create, own-tenant reports) without a second
        // fetchTenant round-trip.
        include: { tenant: { select: { id: true, slug: true, name: true, type: true } } },
      });
      if (!user) throw new NotFoundException();
      const memberships = await this.prisma.membership.findMany({
        where: { userId, status: 'active' },
        include: { role: true, tenant: { select: { slug: true, name: true, type: true } } },
      });
      const permissions = new Set<string>();
      let isSuperAdmin = false;
      for (const m of memberships) {
        for (const p of m.role.permissions ?? []) permissions.add(p);
        if ((m.role.permissions ?? []).includes('*') && m.role.scope === 'all') isSuperAdmin = true;
      }
      return {
        id: user.id, username: user.username, name: user.name, email: user.email,
        homeTenant: user.tenant,
        isSuperAdmin,
        permissions: [...permissions],
        memberships: memberships.map((m) => ({
          tenantSlug: m.tenant.slug, tenantName: m.tenant.name, tenantType: m.tenant.type,
          role: m.role.name, scope: m.role.scope, permissions: m.role.permissions,
        })),
      };
    });
  }
}
