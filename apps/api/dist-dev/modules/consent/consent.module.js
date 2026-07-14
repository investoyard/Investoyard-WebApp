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
exports.ConsentModule = exports.ConsentService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const class_validator_1 = require("class-validator");
const prisma_service_1 = require("../../prisma/prisma.service");
const jwt_auth_guard_1 = require("../../common/jwt-auth.guard");
const tenant_context_1 = require("../../common/tenant-context");
const consent_notices_1 = require("../../common/consent-notices");
var ConsentType;
(function (ConsentType) {
    ConsentType["service"] = "service";
    ConsentType["marketing"] = "marketing";
    ConsentType["data_sharing_rail"] = "data_sharing_rail";
    ConsentType["analytics"] = "analytics";
})(ConsentType || (ConsentType = {}));
class GrantConsentDto {
}
__decorate([
    (0, class_validator_1.IsEnum)(ConsentType),
    __metadata("design:type", String)
], GrantConsentDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GrantConsentDto.prototype, "noticeVersion", void 0);
let ConsentService = class ConsentService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    /** Full consent history (active + withdrawn) — the DPDP data-principal view. */
    async list(userId) {
        const rows = await this.prisma.consent.findMany({ where: { userId }, orderBy: { grantedAt: 'desc' } });
        return rows.map((c) => ({
            id: c.id,
            type: c.type,
            noticeVersion: c.noticeVersion,
            grantedAt: c.grantedAt.toISOString(),
            withdrawnAt: c.withdrawnAt ? c.withdrawnAt.toISOString() : null,
            active: !c.withdrawnAt,
            channel: c.channel ?? undefined,
        }));
    }
    async grant(userId, dto, channel = 'app') {
        return this.prisma.consent.create({
            data: { tenantId: tenant_context_1.tenantContext.requireTenantId(), userId, type: dto.type, noticeVersion: dto.noticeVersion, channel },
        });
    }
    async withdraw(userId, type) {
        await this.prisma.consent.updateMany({
            where: { userId, type: type, withdrawnAt: null },
            data: { withdrawnAt: new Date() },
        });
        return { withdrawn: true };
    }
};
exports.ConsentService = ConsentService;
exports.ConsentService = ConsentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ConsentService);
let ConsentController = class ConsentController {
    constructor(svc) {
        this.svc = svc;
    }
    list(r) { return this.svc.list(r.user.sub); }
    grant(r, dto) { return this.svc.grant(r.user.sub, dto); }
    withdraw(r, type) { return this.svc.withdraw(r.user.sub, type); }
};
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ConsentController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, GrantConsentDto]),
    __metadata("design:returntype", void 0)
], ConsentController.prototype, "grant", null);
__decorate([
    (0, common_1.Delete)(':type'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ConsentController.prototype, "withdraw", null);
ConsentController = __decorate([
    (0, common_1.Controller)('consents'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [ConsentService])
], ConsentController);
/** Public — the current consent notices (version + summary) clients show before consenting. */
let ConsentNoticesController = class ConsentNoticesController {
    list() { return (0, consent_notices_1.consentNoticeList)(); }
};
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ConsentNoticesController.prototype, "list", null);
ConsentNoticesController = __decorate([
    (0, common_1.Controller)('consent-notices')
], ConsentNoticesController);
let ConsentModule = class ConsentModule {
};
exports.ConsentModule = ConsentModule;
exports.ConsentModule = ConsentModule = __decorate([
    (0, common_1.Module)({
        imports: [jwt_1.JwtModule.register({})],
        controllers: [ConsentController, ConsentNoticesController],
        providers: [ConsentService, prisma_service_1.PrismaService, jwt_auth_guard_1.JwtAuthGuard],
    })
], ConsentModule);
