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
exports.SettingsController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const settings_service_1 = require("./settings.service");
const jwt_auth_guard_1 = require("../../common/jwt-auth.guard");
const permissions_guard_1 = require("../../common/permissions.guard");
const require_permissions_decorator_1 = require("../../common/require-permissions.decorator");
class SetOverrideDto {
}
__decorate([
    (0, class_validator_1.Allow)(),
    __metadata("design:type", Object)
], SetOverrideDto.prototype, "value", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SetOverrideDto.prototype, "locked", void 0);
let SettingsController = class SettingsController {
    constructor(settings) {
        this.settings = settings;
    }
    /** Feature catalog (declared before :slug so it isn't captured as a slug). */
    catalog() {
        return this.settings.listFeatures();
    }
    /** Effective (cascaded) settings for a tenant, with value/locked/source per feature. */
    resolve(slug) {
        return this.settings.resolveBySlug(slug);
    }
    // Writes require `tenants.manage`, scoped by role to the target tenant's subtree.
    setOverride(slug, key, dto) {
        return this.settings.setOverride(slug, key, dto.value, dto.locked ?? false);
    }
    clearOverride(slug, key) {
        return this.settings.clearOverride(slug, key);
    }
};
exports.SettingsController = SettingsController;
__decorate([
    (0, common_1.Get)('catalog'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "catalog", null);
__decorate([
    (0, common_1.Get)(':slug'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "resolve", null);
__decorate([
    (0, common_1.Put)(':slug/:key'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, require_permissions_decorator_1.RequirePermissions)('tenants.manage'),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Param)('key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, SetOverrideDto]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "setOverride", null);
__decorate([
    (0, common_1.Delete)(':slug/:key'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, require_permissions_decorator_1.RequirePermissions)('tenants.manage'),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Param)('key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "clearOverride", null);
exports.SettingsController = SettingsController = __decorate([
    (0, common_1.Controller)('settings'),
    __metadata("design:paramtypes", [settings_service_1.SettingsService])
], SettingsController);
