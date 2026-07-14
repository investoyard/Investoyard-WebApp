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
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
/**
 * Resolves a tenant's EFFECTIVE settings by cascading feature values down the
 * tenant tree: platform default → each ancestor → the tenant itself. Walking
 * top-down, the nearest setter wins — UNLESS an ancestor marked it `locked`, in
 * which case that value freezes and lower levels are ignored.
 *
 * FeatureDefinition/TenantSetting are operator config (not RLS-scoped), so the
 * resolver can read ancestor tenants' settings freely.
 */
let SettingsService = class SettingsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    /** Ancestor chain from root (platform) down to and including the tenant. */
    async ancestorChain(tenantId) {
        const chain = [];
        let current = tenantId;
        const seen = new Set();
        while (current && !seen.has(current)) {
            seen.add(current);
            const t = await this.prisma.tenant.findUnique({
                where: { id: current },
                select: { id: true, slug: true, parentId: true },
            });
            if (!t)
                break;
            chain.unshift(t); // prepend → ends up root-first
            current = t.parentId;
        }
        return chain;
    }
    /** Full resolved settings for a tenant (all features). */
    async resolveForTenant(tenantId) {
        const [defs, chain] = await Promise.all([
            this.prisma.featureDefinition.findMany(),
            this.ancestorChain(tenantId),
        ]);
        const tenantIds = chain.map((t) => t.id);
        const rows = tenantIds.length
            ? await this.prisma.tenantSetting.findMany({ where: { tenantId: { in: tenantIds } } })
            : [];
        const byKey = new Map();
        rows.forEach((r) => byKey.set(`${r.tenantId}|${r.featureKey}`, r));
        const out = {};
        for (const def of defs) {
            let value = def.defaultValue;
            let locked = false;
            let source = 'default';
            for (const t of chain) { // root → tenant
                if (locked)
                    break; // an ancestor froze this feature
                const s = byKey.get(`${t.id}|${def.key}`);
                if (s) {
                    value = s.value;
                    source = t.slug;
                    if (s.locked)
                        locked = true;
                }
            }
            out[def.key] = { value, locked, source };
        }
        return out;
    }
    /** Public-facing flags only (isPublic features), flattened to `{ key: value }`. */
    async publicFlags(tenantId) {
        const [defs, resolved] = await Promise.all([
            this.prisma.featureDefinition.findMany({ where: { isPublic: true }, select: { key: true } }),
            this.resolveForTenant(tenantId),
        ]);
        const flags = {};
        for (const d of defs)
            if (resolved[d.key])
                flags[d.key] = resolved[d.key].value;
        return flags;
    }
    /** Resolve by slug — for the admin/settings endpoint. */
    async resolveBySlug(slug) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { slug },
            select: { id: true, slug: true, name: true },
        });
        if (!tenant)
            throw new common_1.NotFoundException(`Tenant '${slug}' not found`);
        return { tenant, settings: await this.resolveForTenant(tenant.id) };
    }
    /** The feature catalog (definitions + platform defaults). */
    listFeatures() {
        return this.prisma.featureDefinition.findMany({ orderBy: { key: 'asc' } });
    }
    async tenantBySlug(slug) {
        const tenant = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
        if (!tenant)
            throw new common_1.NotFoundException(`Tenant '${slug}' not found`);
        return tenant;
    }
    coerce(valueType, value) {
        if (valueType === 'boolean')
            return typeof value === 'string' ? value === 'true' : !!value;
        if (valueType === 'number')
            return typeof value === 'string' ? Number(value) : value;
        return value; // string
    }
    /** Set (or update) a tenant's override for one feature. Returns the re-resolved settings. */
    async setOverride(slug, key, value, locked) {
        const tenant = await this.tenantBySlug(slug);
        const feature = await this.prisma.featureDefinition.findUnique({ where: { key } });
        if (!feature)
            throw new common_1.NotFoundException(`Feature '${key}' not found`);
        const coerced = this.coerce(feature.valueType, value);
        await this.prisma.tenantSetting.upsert({
            where: { tenantId_featureKey: { tenantId: tenant.id, featureKey: key } },
            update: { value: coerced, locked: !!locked },
            create: { tenantId: tenant.id, featureKey: key, value: coerced, locked: !!locked },
        });
        return this.resolveForTenant(tenant.id);
    }
    /** Clear a tenant's override for a feature (falls back to inherited/default). */
    async clearOverride(slug, key) {
        const tenant = await this.tenantBySlug(slug);
        await this.prisma.tenantSetting.deleteMany({ where: { tenantId: tenant.id, featureKey: key } });
        return this.resolveForTenant(tenant.id);
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SettingsService);
