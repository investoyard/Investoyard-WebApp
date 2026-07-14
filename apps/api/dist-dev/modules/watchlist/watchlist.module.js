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
exports.WatchlistModule = exports.WatchlistService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const class_validator_1 = require("class-validator");
const prisma_service_1 = require("../../prisma/prisma.service");
const jwt_auth_guard_1 = require("../../common/jwt-auth.guard");
const tenant_context_1 = require("../../common/tenant-context");
class AddWatchlistDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddWatchlistDto.prototype, "ipoId", void 0);
let WatchlistService = class WatchlistService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(userId) {
        // WatchlistItem has ipoId but no Prisma relation to Ipo, so we resolve the
        // display fields with a second query and merge (keeps the { ...item, ipo } shape).
        const items = await this.prisma.watchlistItem.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
        if (!items.length)
            return [];
        const ipos = await this.prisma.ipo.findMany({
            where: { id: { in: items.map((i) => i.ipoId) } },
            select: { id: true, name: true, symbol: true, openDate: true, status: true },
        });
        const byId = new Map(ipos.map((i) => [i.id, i]));
        return items.map((i) => ({ ...i, ipo: byId.get(i.ipoId) ?? null }));
    }
    async add(userId, ipoId) {
        return this.prisma.watchlistItem.upsert({
            where: { userId_ipoId: { userId, ipoId } },
            update: {},
            create: { tenantId: tenant_context_1.tenantContext.requireTenantId(), userId, ipoId },
        });
    }
    async remove(userId, ipoId) {
        await this.prisma.watchlistItem.deleteMany({ where: { userId, ipoId } });
        return { removed: true };
    }
};
exports.WatchlistService = WatchlistService;
exports.WatchlistService = WatchlistService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], WatchlistService);
let WatchlistController = class WatchlistController {
    constructor(svc) {
        this.svc = svc;
    }
    list(r) { return this.svc.list(r.user.sub); }
    add(r, dto) { return this.svc.add(r.user.sub, dto.ipoId); }
    remove(r, ipoId) { return this.svc.remove(r.user.sub, ipoId); }
};
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], WatchlistController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, AddWatchlistDto]),
    __metadata("design:returntype", void 0)
], WatchlistController.prototype, "add", null);
__decorate([
    (0, common_1.Delete)(':ipoId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('ipoId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], WatchlistController.prototype, "remove", null);
WatchlistController = __decorate([
    (0, common_1.Controller)('watchlist'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [WatchlistService])
], WatchlistController);
let WatchlistModule = class WatchlistModule {
};
exports.WatchlistModule = WatchlistModule;
exports.WatchlistModule = WatchlistModule = __decorate([
    (0, common_1.Module)({
        imports: [jwt_1.JwtModule.register({})],
        controllers: [WatchlistController],
        providers: [WatchlistService, prisma_service_1.PrismaService, jwt_auth_guard_1.JwtAuthGuard],
    })
], WatchlistModule);
