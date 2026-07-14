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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthModule = exports.HealthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const redis_service_1 = require("../../common/redis.service");
/** Liveness/readiness checks shared by the public probe and the admin status view. */
let HealthService = class HealthService {
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
    }
    async database() {
        try {
            await this.prisma.$queryRawUnsafe('SELECT 1');
            return 'up';
        }
        catch {
            return 'down';
        }
    }
    async redisState() {
        if (!this.redis.client)
            return 'disabled';
        try {
            return (await this.redis.client.ping()) === 'PONG' ? 'up' : 'down';
        }
        catch {
            return 'down';
        }
    }
};
exports.HealthService = HealthService;
exports.HealthService = HealthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, redis_service_1.RedisService])
], HealthService);
/** Public probe for load balancers / uptime monitors (no auth, no sensitive detail). */
let HealthController = class HealthController {
    constructor(health) {
        this.health = health;
    }
    async check(res) {
        const [database, redis] = await Promise.all([this.health.database(), this.health.redisState()]);
        const ok = database === 'up';
        if (!ok)
            res.status(503);
        return { status: ok ? 'ok' : 'degraded', checks: { database, redis }, uptimeSec: Math.round(process.uptime()) };
    }
};
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "check", null);
HealthController = __decorate([
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [HealthService])
], HealthController);
let HealthModule = class HealthModule {
};
exports.HealthModule = HealthModule;
exports.HealthModule = HealthModule = __decorate([
    (0, common_1.Module)({
        controllers: [HealthController],
        providers: [HealthService, prisma_service_1.PrismaService],
        exports: [HealthService],
    })
], HealthModule);
