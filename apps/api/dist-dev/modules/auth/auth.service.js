"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const crypto_1 = require("crypto");
const prisma_service_1 = require("../../prisma/prisma.service");
const sms_service_1 = require("../../common/sms.service");
const redis_service_1 = require("../../common/redis.service");
const password_1 = require("../../common/password");
const tenant_context_1 = require("../../common/tenant-context");
const DEV_OTP = '123456'; // accepted only when SMS delivery is not configured
const OTP_TTL = 5 * 60; // seconds
const RL_MAX = 5; // max OTP requests per mobile per hour
const RL_COOLDOWN = 30; // seconds between requests for a mobile
/**
 * OTP auth (Tier 1). A real 6-digit OTP is generated and sent via SmsService; in
 * DEV (no SMS provider) it's logged and 123456 is also accepted. The pending OTP
 * store and request rate-limits live in Redis (survive restarts, work across API
 * instances); without REDIS_URL they fall back to in-memory (dev, single instance).
 */
let AuthService = class AuthService {
    constructor(prisma, jwt, sms, redis) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.sms = sms;
        this.redis = redis;
        this.mem = new Map(); // fallback when Redis is absent
    }
    async storeOtp(rid, rec) {
        if (this.redis.client)
            await this.redis.client.set(`otp:${rid}`, JSON.stringify(rec), 'EX', OTP_TTL);
        else
            this.mem.set(rid, rec);
    }
    async readOtp(rid) {
        if (this.redis.client) {
            const v = await this.redis.client.get(`otp:${rid}`);
            return v ? JSON.parse(v) : null;
        }
        return this.mem.get(rid) ?? null;
    }
    async dropOtp(rid) {
        if (this.redis.client)
            await this.redis.client.del(`otp:${rid}`);
        else
            this.mem.delete(rid);
    }
    /** Throttle OTP requests per mobile (cooldown + hourly cap). Only when real SMS is
     *  configured — dev logs OTPs (no cost/bombing risk) and stays unthrottled. */
    async rateLimit(mobile) {
        if (!this.redis.client || !(await this.sms.isEnabled()))
            return;
        const cd = await this.redis.client.set(`otp:cd:${mobile}`, '1', 'EX', RL_COOLDOWN, 'NX');
        if (cd === null)
            throw new common_1.HttpException('Please wait before requesting another OTP.', common_1.HttpStatus.TOO_MANY_REQUESTS);
        const n = await this.redis.client.incr(`otp:rl:${mobile}`);
        if (n === 1)
            await this.redis.client.expire(`otp:rl:${mobile}`, 3600);
        if (n > RL_MAX)
            throw new common_1.HttpException('Too many OTP requests. Try again later.', common_1.HttpStatus.TOO_MANY_REQUESTS);
    }
    async requestOtp(mobile) {
        if (!/^\d{10}$/.test(mobile))
            throw new common_1.BadRequestException('Invalid mobile');
        await this.rateLimit(mobile);
        const requestId = (0, crypto_1.randomBytes)(16).toString('hex');
        const otp = String((0, crypto_1.randomInt)(100000, 1000000)); // real 6-digit code
        await this.storeOtp(requestId, { mobile, otp, exp: Date.now() + OTP_TTL * 1000 });
        await this.sms.send(mobile, `Your Investoyard OTP is ${otp}. Valid for 5 minutes.`, { otp });
        return { requestId };
    }
    async verifyOtp(requestId, otp) {
        const rec = await this.readOtp(requestId);
        if (!rec || rec.exp < Date.now())
            throw new common_1.BadRequestException('OTP expired');
        const devBypass = !(await this.sms.isEnabled()) && otp === DEV_OTP;
        if (rec.otp !== otp && !devBypass)
            throw new common_1.BadRequestException('Invalid OTP');
        await this.dropOtp(requestId);
        // Login is tenant-AGNOSTIC: a user is identified by their globally-unique mobile,
        // and their home tenant isn't known until we find them. So resolve the user with
        // NO tenant scope (else RLS, set to the inbound brand, would hide users whose home
        // tenant differs — e.g. an operator admin signing in from the default door).
        // New users are stamped with the inbound tenant (resolved by TenantMiddleware).
        const inboundTenant = tenant_context_1.tenantContext.requireTenantId();
        const user = await tenant_context_1.tenantContext.runUnscoped(async () => {
            const u = await this.prisma.user.upsert({
                where: { mobile: rec.mobile },
                update: {},
                create: { mobile: rec.mobile, tenantId: inboundTenant },
            });
            return u.tenantId ? u : this.prisma.user.update({ where: { id: u.id }, data: { tenantId: inboundTenant } });
        });
        const accessToken = await this.jwt.signAsync({ sub: user.id, mobile: user.mobile, tenant: user.tenantId ?? undefined }, { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES_IN ?? '30d' });
        return { accessToken, user: { id: user.id, mobile: user.mobile, name: user.name, tenantId: user.tenantId } };
    }
    /**
     * Operator login (superadmin / partner / branch) — username + password. Tenant-
     * agnostic lookup (operators' home tenant varies); issues the same JWT shape as
     * the OTP flow so JwtAuthGuard + PermissionsGuard work identically.
     */
    async operatorLogin(username, password) {
        const uname = (username ?? '').trim().toLowerCase();
        const user = await tenant_context_1.tenantContext.runUnscoped(async () => this.prisma.user.findUnique({ where: { username: uname } }));
        if (!user || user.status !== 'active' || !(await (0, password_1.verifyPassword)(password, user.passwordHash))) {
            throw new common_1.UnauthorizedException('Invalid username or password');
        }
        const accessToken = await this.jwt.signAsync({ sub: user.id, username: user.username, tenant: user.tenantId ?? undefined }, { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES_IN ?? '30d' });
        return { accessToken, user: { id: user.id, username: user.username, name: user.name, tenantId: user.tenantId } };
    }
    /** The logged-in operator's identity + effective permissions (drives the admin UI). */
    async me(userId) {
        return tenant_context_1.tenantContext.runUnscoped(async () => {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                include: { tenant: { select: { slug: true, name: true, type: true } } },
            });
            if (!user)
                throw new common_1.NotFoundException();
            const memberships = await this.prisma.membership.findMany({
                where: { userId, status: 'active' },
                include: { role: true, tenant: { select: { slug: true, name: true, type: true } } },
            });
            const permissions = new Set();
            let isSuperAdmin = false;
            for (const m of memberships) {
                for (const p of m.role.permissions ?? [])
                    permissions.add(p);
                if ((m.role.permissions ?? []).includes('*') && m.role.scope === 'all')
                    isSuperAdmin = true;
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
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        sms_service_1.SmsService,
        redis_service_1.RedisService])
], AuthService);
