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
exports.IpoController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../../common/jwt-auth.guard");
const permissions_guard_1 = require("../../common/permissions.guard");
const require_permissions_decorator_1 = require("../../common/require-permissions.decorator");
const ipo_service_1 = require("./ipo.service");
const ipo_dto_1 = require("./ipo.dto");
/** Public reads (Tier 0) power anonymous browse + SEO; writes are operator-gated. */
let IpoController = class IpoController {
    constructor(ipo) {
        this.ipo = ipo;
    }
    list(type, status, q) {
        return this.ipo.list({ type, status, q });
    }
    // Catalog management — the IPO catalog is global platform data (operator-managed).
    create(dto) {
        return this.ipo.create(dto);
    }
    update(id, dto) {
        return this.ipo.update(id, dto);
    }
    remove(id) {
        return this.ipo.remove(id);
    }
    bySymbol(symbol) {
        return this.ipo.getBySymbol(symbol);
    }
    get(id) {
        return this.ipo.get(id);
    }
    subscription(id) {
        return this.ipo.latestSubscription(id);
    }
    gmp(id) {
        return this.ipo.latestGmp(id);
    }
    documents(id) {
        return this.ipo.documents(id);
    }
};
exports.IpoController = IpoController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('type')),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], IpoController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, require_permissions_decorator_1.RequirePermissions)('ipos.manage'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ipo_dto_1.CreateIpoDto]),
    __metadata("design:returntype", void 0)
], IpoController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, require_permissions_decorator_1.RequirePermissions)('ipos.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ipo_dto_1.UpdateIpoDto]),
    __metadata("design:returntype", void 0)
], IpoController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, require_permissions_decorator_1.RequirePermissions)('ipos.manage'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IpoController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('by-symbol/:symbol'),
    __param(0, (0, common_1.Param)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IpoController.prototype, "bySymbol", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IpoController.prototype, "get", null);
__decorate([
    (0, common_1.Get)(':id/subscription'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IpoController.prototype, "subscription", null);
__decorate([
    (0, common_1.Get)(':id/gmp'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IpoController.prototype, "gmp", null);
__decorate([
    (0, common_1.Get)(':id/documents'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IpoController.prototype, "documents", null);
exports.IpoController = IpoController = __decorate([
    (0, common_1.Controller)('ipos'),
    __metadata("design:paramtypes", [ipo_service_1.IpoService])
], IpoController);
