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
exports.DevicesModule = exports.DevicesService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const class_validator_1 = require("class-validator");
const prisma_service_1 = require("../../prisma/prisma.service");
const jwt_auth_guard_1 = require("../../common/jwt-auth.guard");
const tenant_context_1 = require("../../common/tenant-context");
class RegisterDeviceDto {
}
__decorate([
    (0, class_validator_1.IsIn)(['ios', 'android', 'web']),
    __metadata("design:type", String)
], RegisterDeviceDto.prototype, "platform", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterDeviceDto.prototype, "token", void 0);
/** Device registration for push notifications (allotment / closing-soon / listing alerts). */
let DevicesService = class DevicesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async register(userId, dto) {
        return this.prisma.deviceToken.upsert({
            where: { token: dto.token },
            update: { userId, platform: dto.platform, active: true },
            create: { tenantId: tenant_context_1.tenantContext.requireTenantId(), userId, platform: dto.platform, token: dto.token },
        });
    }
    async deactivate(userId, token) {
        await this.prisma.deviceToken.updateMany({ where: { userId, token }, data: { active: false } });
        return { deactivated: true };
    }
};
exports.DevicesService = DevicesService;
exports.DevicesService = DevicesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DevicesService);
let DevicesController = class DevicesController {
    constructor(svc) {
        this.svc = svc;
    }
    register(r, dto) { return this.svc.register(r.user.sub, dto); }
    deactivate(r, token) { return this.svc.deactivate(r.user.sub, token); }
};
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, RegisterDeviceDto]),
    __metadata("design:returntype", void 0)
], DevicesController.prototype, "register", null);
__decorate([
    (0, common_1.Delete)(':token'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DevicesController.prototype, "deactivate", null);
DevicesController = __decorate([
    (0, common_1.Controller)('devices'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [DevicesService])
], DevicesController);
let DevicesModule = class DevicesModule {
};
exports.DevicesModule = DevicesModule;
exports.DevicesModule = DevicesModule = __decorate([
    (0, common_1.Module)({
        imports: [jwt_1.JwtModule.register({})],
        controllers: [DevicesController],
        providers: [DevicesService, prisma_service_1.PrismaService, jwt_auth_guard_1.JwtAuthGuard],
    })
], DevicesModule);
