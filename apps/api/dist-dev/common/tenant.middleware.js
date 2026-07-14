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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantMiddleware = void 0;
const common_1 = require("@nestjs/common");
const tenants_service_1 = require("../modules/tenants/tenants.service");
const tenant_context_1 = require("./tenant-context");
/**
 * Establishes the tenant context for every request BEFORE guards/controllers run.
 *
 * Inbound resolution order: `x-tenant` (slug, used by the apps) → Host / custom
 * domain → the Direct channel as fallback. For authenticated requests JwtAuthGuard
 * later overrides this with the user's own home tenant (the authoritative value).
 */
let TenantMiddleware = class TenantMiddleware {
    constructor(tenants) {
        this.tenants = tenants;
    }
    async use(req, _res, next) {
        const slug = (req.headers['x-tenant'] ?? req.headers['x-tenant-slug']);
        const host = (req.headers['x-forwarded-host'] ?? req.headers['host']);
        let store = {};
        try {
            const t = await this.tenants.resolveRequestTenant(slug, host);
            if (t)
                store = { tenantId: t.id, tenantSlug: t.slug };
        }
        catch {
            // Never block a request on tenant resolution; writes simply go unstamped
            // until the guard supplies the user's tenant.
        }
        tenant_context_1.tenantContext.run(store, () => next());
    }
};
exports.TenantMiddleware = TenantMiddleware;
exports.TenantMiddleware = TenantMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenants_service_1.TenantsService])
], TenantMiddleware);
