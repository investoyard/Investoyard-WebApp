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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const jwt_auth_guard_1 = require("../../common/jwt-auth.guard");
const permissions_guard_1 = require("../../common/permissions.guard");
const require_permissions_decorator_1 = require("../../common/require-permissions.decorator");
const applications_service_1 = require("../applications/applications.service");
const provider_config_service_1 = require("../../common/provider-config.service");
const admin_service_1 = require("./admin.service");
class AddMemberDto {
}
__decorate([
    (0, class_validator_1.Matches)(/^\d{10}$/),
    __metadata("design:type", String)
], AddMemberDto.prototype, "mobile", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddMemberDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddMemberDto.prototype, "roleName", void 0);
class UpdateMemberDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateMemberDto.prototype, "roleName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['active', 'inactive']),
    __metadata("design:type", String)
], UpdateMemberDto.prototype, "status", void 0);
class CreateRoleDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRoleDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['own', 'subtree', 'all']),
    __metadata("design:type", String)
], CreateRoleDto.prototype, "scope", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayNotEmpty)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateRoleDto.prototype, "permissions", void 0);
class UpdateRoleDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['own', 'subtree', 'all']),
    __metadata("design:type", String)
], UpdateRoleDto.prototype, "scope", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], UpdateRoleDto.prototype, "permissions", void 0);
class CreateRailDto {
}
__decorate([
    (0, class_validator_1.IsIn)(['NSE_EIPO', 'BSE_IBBS']),
    __metadata("design:type", String)
], CreateRailDto.prototype, "exchange", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRailDto.prototype, "memberName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRailDto.prototype, "memberType", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRailDto.prototype, "loginId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRailDto.prototype, "memberCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRailDto.prototype, "password", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRailDto.prototype, "ibbsId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRailDto.prototype, "subBrokerCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRailDto.prototype, "baseUrl", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['live', 'uat']),
    __metadata("design:type", String)
], CreateRailDto.prototype, "env", void 0);
class UpdateRailDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['NSE_EIPO', 'BSE_IBBS']),
    __metadata("design:type", String)
], UpdateRailDto.prototype, "exchange", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateRailDto.prototype, "memberName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateRailDto.prototype, "memberType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateRailDto.prototype, "loginId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateRailDto.prototype, "memberCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateRailDto.prototype, "password", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateRailDto.prototype, "ibbsId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateRailDto.prototype, "subBrokerCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateRailDto.prototype, "baseUrl", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['live', 'uat']),
    __metadata("design:type", String)
], UpdateRailDto.prototype, "env", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateRailDto.prototype, "active", void 0);
class ImportAllotmentsDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportAllotmentsDto.prototype, "csv", void 0);
class ProviderConfigDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ProviderConfigDto.prototype, "enabled", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ProviderConfigDto.prototype, "settings", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ProviderConfigDto.prototype, "secrets", void 0);
let AdminController = class AdminController {
    constructor(admin, apps, providers) {
        this.admin = admin;
        this.apps = apps;
        this.providers = providers;
    }
    /** Provider keys & integrations (SMS, push) — secrets vaulted, never returned. */
    listProviders() {
        return this.providers.list();
    }
    saveProvider(provider, dto) {
        return this.providers.upsert(provider, dto);
    }
    /** Back-office: bulk allotment from the registrar's CSV (platform operator). */
    importAllotments(symbol, dto) {
        return this.admin.importAllotments(symbol, dto.csv, (id, lots) => this.apps.recordAllotment(id, lots));
    }
    roles() {
        return this.admin.listRoles();
    }
    permissions() {
        return this.admin.listPermissions();
    }
    audit() {
        return this.admin.listAudit();
    }
    status() {
        return this.admin.systemStatus();
    }
    rails() {
        return this.admin.listRails();
    }
    createRail(dto) {
        return this.admin.createRail(dto);
    }
    updateRail(id, dto) {
        return this.admin.updateRail(id, dto);
    }
    testRail(id) {
        return this.admin.testRail(id);
    }
    createRole(dto) {
        return this.admin.createRole(dto);
    }
    updateRole(id, dto) {
        return this.admin.updateRole(id, dto);
    }
    deleteRole(id) {
        return this.admin.deleteRole(id);
    }
    members(slug) {
        return this.admin.listMembers(slug);
    }
    applications(slug) {
        return this.admin.listApplications(slug);
    }
    dashboard(slug) {
        return this.admin.dashboard(slug);
    }
    reports(slug) {
        return this.admin.reports(slug);
    }
    async exportCsv(slug, res) {
        const csv = await this.admin.applicationsCsv(slug);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="investoyard-${slug}-applications.csv"`);
        return csv;
    }
    addMember(slug, dto) {
        return this.admin.addMember(slug, dto);
    }
    updateMember(slug, membershipId, dto) {
        return this.admin.updateMember(slug, membershipId, dto);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('providers'),
    (0, require_permissions_decorator_1.RequirePermissions)('providers.manage'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listProviders", null);
__decorate([
    (0, common_1.Put)('providers/:provider'),
    (0, require_permissions_decorator_1.RequirePermissions)('providers.manage'),
    __param(0, (0, common_1.Param)('provider')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ProviderConfigDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "saveProvider", null);
__decorate([
    (0, common_1.Post)('allotments/:symbol/import'),
    (0, require_permissions_decorator_1.RequirePermissions)('bids.manage'),
    __param(0, (0, common_1.Param)('symbol')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ImportAllotmentsDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "importAllotments", null);
__decorate([
    (0, common_1.Get)('roles'),
    (0, require_permissions_decorator_1.RequirePermissions)('roles.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "roles", null);
__decorate([
    (0, common_1.Get)('permissions'),
    (0, require_permissions_decorator_1.RequirePermissions)('roles.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "permissions", null);
__decorate([
    (0, common_1.Get)('audit'),
    (0, require_permissions_decorator_1.RequirePermissions)('audit.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "audit", null);
__decorate([
    (0, common_1.Get)('status'),
    (0, require_permissions_decorator_1.RequirePermissions)('dashboard.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "status", null);
__decorate([
    (0, common_1.Get)('rails'),
    (0, require_permissions_decorator_1.RequirePermissions)('rails.manage'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "rails", null);
__decorate([
    (0, common_1.Post)('rails'),
    (0, require_permissions_decorator_1.RequirePermissions)('rails.manage'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateRailDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createRail", null);
__decorate([
    (0, common_1.Patch)('rails/:id'),
    (0, require_permissions_decorator_1.RequirePermissions)('rails.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateRailDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateRail", null);
__decorate([
    (0, common_1.Post)('rails/:id/test'),
    (0, require_permissions_decorator_1.RequirePermissions)('rails.manage'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "testRail", null);
__decorate([
    (0, common_1.Post)('roles'),
    (0, require_permissions_decorator_1.RequirePermissions)('roles.manage'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateRoleDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createRole", null);
__decorate([
    (0, common_1.Patch)('roles/:id'),
    (0, require_permissions_decorator_1.RequirePermissions)('roles.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateRoleDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateRole", null);
__decorate([
    (0, common_1.Delete)('roles/:id'),
    (0, require_permissions_decorator_1.RequirePermissions)('roles.manage'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteRole", null);
__decorate([
    (0, common_1.Get)('members/:slug'),
    (0, require_permissions_decorator_1.RequirePermissions)('users.view'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "members", null);
__decorate([
    (0, common_1.Get)('applications/:slug'),
    (0, require_permissions_decorator_1.RequirePermissions)('bids.view'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "applications", null);
__decorate([
    (0, common_1.Get)('dashboard/:slug'),
    (0, require_permissions_decorator_1.RequirePermissions)('dashboard.view'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "dashboard", null);
__decorate([
    (0, common_1.Get)('reports/:slug'),
    (0, require_permissions_decorator_1.RequirePermissions)('reports.view'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "reports", null);
__decorate([
    (0, common_1.Get)('reports/:slug/export'),
    (0, require_permissions_decorator_1.RequirePermissions)('reports.view'),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "exportCsv", null);
__decorate([
    (0, common_1.Post)('members/:slug'),
    (0, require_permissions_decorator_1.RequirePermissions)('users.manage'),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, AddMemberDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "addMember", null);
__decorate([
    (0, common_1.Patch)('members/:slug/:membershipId'),
    (0, require_permissions_decorator_1.RequirePermissions)('users.manage'),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Param)('membershipId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, UpdateMemberDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateMember", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    __metadata("design:paramtypes", [admin_service_1.AdminService,
        applications_service_1.ApplicationsService,
        provider_config_service_1.ProviderConfigService])
], AdminController);
