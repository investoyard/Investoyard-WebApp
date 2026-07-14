"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfilesModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const pii_vault_service_1 = require("../../common/pii-vault.service");
const jwt_auth_guard_1 = require("../../common/jwt-auth.guard");
const jwt_1 = require("@nestjs/jwt");
const profiles_controller_1 = require("./profiles.controller");
const profiles_service_1 = require("./profiles.service");
let ProfilesModule = class ProfilesModule {
};
exports.ProfilesModule = ProfilesModule;
exports.ProfilesModule = ProfilesModule = __decorate([
    (0, common_1.Module)({
        imports: [jwt_1.JwtModule.register({})],
        controllers: [profiles_controller_1.ProfilesController],
        providers: [profiles_service_1.ProfilesService, prisma_service_1.PrismaService, pii_vault_service_1.PiiVaultService, jwt_auth_guard_1.JwtAuthGuard],
        exports: [pii_vault_service_1.PiiVaultService],
    })
], ProfilesModule);
