import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsService } from '../../common/sms.service';
import { RedisService } from '../../common/redis.service';
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
    private sms: SmsService,
    private redis: RedisService,
  ) {}

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
    if (!this.redis.client || !(await this.sms.isEnabled())) return;
    const cd = await this.redis.client.set(`otp:cd:${mobile}`, '1', 'EX', RL_COOLDOWN, 'NX');
    if (cd === null) throw new HttpException('Please wait before requesting another OTP.', HttpStatus.TOO_MANY_REQUESTS);
    const n = await this.redis.client.incr(`otp:rl:${mobile}`);
    if (n === 1) await this.redis.client.expire(`otp:rl:${mobile}`, 3600);
    if (n > RL_MAX) throw new HttpException('Too many OTP requests. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }

  async requestOtp(mobile: string): Promise<{ requestId: string }> {
    if (!/^\d{10}$/.test(mobile)) throw new BadRequestException('Invalid mobile');
    await this.rateLimit(mobile);
    const requestId = randomBytes(16).toString('hex');
    const otp = String(randomInt(100000, 1000000)); // real 6-digit code
    await this.storeOtp(requestId, { mobile, otp, exp: Date.now() + OTP_TTL * 1000 });
    await this.sms.send(mobile, `Your Investoyard OTP is ${otp}. Valid for 5 minutes.`, { otp });
    return { requestId };
  }

  async verifyOtp(requestId: string, otp: string) {
    const rec = await this.readOtp(requestId);
    if (!rec || rec.exp < Date.now()) throw new BadRequestException('OTP expired');
    const devBypass = !(await this.sms.isEnabled()) && otp === DEV_OTP;
    if (rec.otp !== otp && !devBypass) throw new BadRequestException('Invalid OTP');
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
    return { accessToken, user: { id: user.id, mobile: user.mobile, name: user.name, tenantId: user.tenantId } };
  }
}
