"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IpoModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../../prisma/prisma.service");
const jwt_auth_guard_1 = require("../../common/jwt-auth.guard");
const permissions_guard_1 = require("../../common/permissions.guard");
const rail_module_1 = require("../rail/rail.module");
const notifications_module_1 = require("../notifications/notifications.module");
const ipo_controller_1 = require("./ipo.controller");
const ipo_service_1 = require("./ipo.service");
let IpoModule = class IpoModule {
};
exports.IpoModule = IpoModule;
exports.IpoModule = IpoModule = __decorate([
    (0, common_1.Module)({
        imports: [rail_module_1.RailModule, notifications_module_1.NotificationsModule, jwt_1.JwtModule.register({})],
        controllers: [ipo_controller_1.IpoController],
        providers: [ipo_service_1.IpoService, prisma_service_1.PrismaService, jwt_auth_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard],
        exports: [ipo_service_1.IpoService],
    })
], IpoModule);
