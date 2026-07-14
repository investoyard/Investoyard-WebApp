"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("./prisma/prisma.service");
const tenant_middleware_1 = require("./common/tenant.middleware");
const audit_interceptor_1 = require("./common/audit.interceptor");
const redis_service_1 = require("./common/redis.service");
const provider_config_service_1 = require("./common/provider-config.service");
const health_module_1 = require("./modules/health/health.module");
const auth_module_1 = require("./modules/auth/auth.module");
const profiles_module_1 = require("./modules/profiles/profiles.module");
const ipo_module_1 = require("./modules/ipo/ipo.module");
const tenants_module_1 = require("./modules/tenants/tenants.module");
const settings_module_1 = require("./modules/settings/settings.module");
const admin_module_1 = require("./modules/admin/admin.module");
const applications_module_1 = require("./modules/applications/applications.module");
const rail_module_1 = require("./modules/rail/rail.module");
const queue_module_1 = require("./modules/queue/queue.module");
const consent_module_1 = require("./modules/consent/consent.module");
const watchlist_module_1 = require("./modules/watchlist/watchlist.module");
const devices_module_1 = require("./modules/devices/devices.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
let AppModule = class AppModule {
    /** Establish the tenant context on every request before guards/controllers run. */
    configure(consumer) {
        consumer.apply(tenant_middleware_1.TenantMiddleware).forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            redis_service_1.RedisModule,
            provider_config_service_1.ProviderConfigModule,
            health_module_1.HealthModule,
            auth_module_1.AuthModule,
            profiles_module_1.ProfilesModule,
            ipo_module_1.IpoModule,
            tenants_module_1.TenantsModule,
            settings_module_1.SettingsModule,
            admin_module_1.AdminModule,
            applications_module_1.ApplicationsModule,
            rail_module_1.RailModule,
            queue_module_1.QueueModule,
            consent_module_1.ConsentModule,
            watchlist_module_1.WatchlistModule,
            devices_module_1.DevicesModule,
            notifications_module_1.NotificationsModule,
        ],
        providers: [
            prisma_service_1.PrismaService,
            { provide: core_1.APP_INTERCEPTOR, useClass: audit_interceptor_1.AuditInterceptor },
        ],
    })
], AppModule);
