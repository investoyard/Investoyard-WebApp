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
exports.TenantsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const settings_service_1 = require("../settings/settings.service");
let TenantsService = class TenantsService {
    constructor(prisma, settings) {
        this.prisma = prisma;
        this.settings = settings;
    }
    /** Public branding/flags view — `flags` is resolved from the settings cascade. */
    async view(t) {
        return {
            id: t.id, slug: t.slug, type: t.type, name: t.name,
            customDomain: t.customDomain ?? undefined,
            brandColor: t.brandColor ?? undefined,
            goldColor: t.goldColor ?? undefined,
            logoUrl: t.logoUrl ?? undefined,
            flags: await this.settings.publicFlags(t.id),
        };
    }
    /** All customer-facing channels (direct / partner / branch) — powers web branding. */
    async list() {
        const rows = await this.prisma.tenant.findMany({
            where: { status: 'active', type: { in: ['direct', 'partner', 'branch'] } },
            orderBy: { name: 'asc' },
        });
        return Promise.all(rows.map((t) => this.view(t)));
    }
    /** Full tenant tree (incl. the platform root) with resolved flags — for the admin console. */
    async tree() {
        const rows = await this.prisma.tenant.findMany({ orderBy: { name: 'asc' } });
        return Promise.all(rows.map(async (t) => ({
            id: t.id, slug: t.slug, name: t.name, type: t.type, parentId: t.parentId,
            customDomain: t.customDomain ?? undefined, brandColor: t.brandColor ?? undefined,
            status: t.status, flags: await this.settings.publicFlags(t.id),
        })));
    }
    /**
     * Resolve the active tenant for a request: explicit `x-tenant` slug first, then
     * the Host / custom domain, then the Direct channel as fallback. Returns the id
     * + slug for the request context (not the public branding view).
     */
    async resolveRequestTenant(slug, host) {
        if (slug) {
            const t = await this.prisma.tenant.findFirst({ where: { slug: slug.toLowerCase(), status: 'active' } });
            if (t)
                return { id: t.id, slug: t.slug };
        }
        if (host) {
            const h = host.toLowerCase().split(':')[0];
            const t = await this.prisma.tenant.findFirst({ where: { customDomain: h } });
            if (t)
                return { id: t.id, slug: t.slug };
        }
        const def = await this.prisma.tenant.findFirst({ where: { type: 'direct' } });
        return def ? { id: def.id, slug: def.slug } : null;
    }
    /** Resolve a tenant by its custom domain (host). Falls back to the Direct channel. */
    async resolveByHost(host) {
        const fallback = await this.prisma.tenant.findFirst({ where: { type: 'direct' } });
        if (!host)
            return fallback ? this.view(fallback) : null;
        const h = host.toLowerCase().split(':')[0];
        const t = await this.prisma.tenant.findFirst({ where: { customDomain: h } });
        const resolved = t ?? fallback;
        return resolved ? this.view(resolved) : null;
    }
};
exports.TenantsService = TenantsService;
exports.TenantsService = TenantsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, settings_service_1.SettingsService])
], TenantsService);
