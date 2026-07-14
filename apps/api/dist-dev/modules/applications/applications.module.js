"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplicationsModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../../prisma/prisma.service");
const pii_vault_service_1 = require("../../common/pii-vault.service");
const jwt_auth_guard_1 = require("../../common/jwt-auth.guard");
const permissions_guard_1 = require("../../common/permissions.guard");
const rail_module_1 = require("../rail/rail.module");
const queue_module_1 = require("../queue/queue.module");
const notifications_module_1 = require("../notifications/notifications.module");
const applications_controller_1 = require("./applications.controller");
const applications_service_1 = require("./applications.service");
let ApplicationsModule = class ApplicationsModule {
};
exports.ApplicationsModule = ApplicationsModule;
exports.ApplicationsModule = ApplicationsModule = __decorate([
    (0, common_1.Module)({
        imports: [rail_module_1.RailModule, queue_module_1.QueueModule, notifications_module_1.NotificationsModule, jwt_1.JwtModule.register({})],
        controllers: [applications_controller_1.ApplicationsController],
        providers: [applications_service_1.ApplicationsService, prisma_service_1.PrismaService, pii_vault_service_1.PiiVaultService, jwt_auth_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard],
        exports: [applications_service_1.ApplicationsService],
    })
], ApplicationsModule);
