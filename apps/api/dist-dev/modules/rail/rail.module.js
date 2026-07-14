"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RailModule = void 0;
const common_1 = require("@nestjs/common");
const rail_adapters_1 = require("@investoyard/rail-adapters");
const prisma_service_1 = require("../../prisma/prisma.service");
const pii_vault_service_1 = require("../../common/pii-vault.service");
const notifications_module_1 = require("../notifications/notifications.module");
const rail_service_1 = require("./rail.service");
const rail_callback_controller_1 = require("./rail-callback.controller");
const rail_callback_guard_1 = require("./rail-callback.guard");
const rail_callback_providers_1 = require("./rail-callback.providers");
let RailModule = class RailModule {
};
exports.RailModule = RailModule;
exports.RailModule = RailModule = __decorate([
    (0, common_1.Module)({
        imports: [notifications_module_1.NotificationsModule],
        controllers: [rail_callback_controller_1.RailCallbackController],
        providers: [
            rail_service_1.RailService,
            prisma_service_1.PrismaService,
            pii_vault_service_1.PiiVaultService,
            rail_callback_guard_1.RailCallbackGuard,
            rail_callback_providers_1.PrismaApplicationRepo,
            rail_callback_providers_1.PushNotifier,
            {
                provide: rail_adapters_1.RailCallbackService,
                useFactory: (repo, notifier) => new rail_adapters_1.RailCallbackService(repo, notifier),
                inject: [rail_callback_providers_1.PrismaApplicationRepo, rail_callback_providers_1.PushNotifier],
            },
        ],
        exports: [rail_service_1.RailService],
    })
], RailModule);
