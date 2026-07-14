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
exports.PermissionsGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const prisma_service_1 = require("../prisma/prisma.service");
const require_permissions_decorator_1 = require("./require-permissions.decorator");
/**
 * Checks the authenticated user (req.user.sub, set by JwtAuthGuard) has the
 * required permission(s) — resolved fresh from Membership → Role, so revocation
 * takes effect immediately. Permission grants are constrained by role scope:
 *   all      → any tenant (platform SuperAdmin)
 *   subtree  → the membership's tenant and its descendants
 *   own      → only the membership's tenant
 * The target tenant is taken from the `:slug` route param when present.
 */
let PermissionsGuard = class PermissionsGuard {
    constructor(reflector, prisma) {
        this.reflector = reflector;
        this.prisma = prisma;
    }
    async canActivate(ctx) {
        const required = this.reflector.getAllAndOverride(require_permissions_decorator_1.PERMISSIONS_KEY, [ctx.getHandler(), ctx.getClass()]) ?? [];
        if (!required.length)
            return true;
        const req = ctx.switchToHttp().getRequest();
        const userId = req.user?.sub;
        if (!userId)
            throw new common_1.ForbiddenException('Not authenticated');
        // Target tenant (if the route addresses one via :slug).
        let targetTenantId = null;
        const slug = req.params?.slug;
        if (slug) {
            const t = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
            if (!t)
                throw new common_1.ForbiddenException(`Unknown tenant '${slug}'`);
            targetTenantId = t.id;
        }
        const memberships = await this.prisma.membership.findMany({
            where: { userId, status: 'active' },
            include: { role: true },
        });
        for (const perm of required) {
            if (!(await this.grants(memberships, perm, targetTenantId))) {
                throw new common_1.ForbiddenException(`Missing permission: ${perm}`);
            }
        }
        return true;
    }
    async grants(memberships, perm, target) {
        for (const m of memberships) {
            const perms = m.role?.permissions ?? [];
            if (!(perms.includes(perm) || perms.includes('*')))
                continue;
            if (m.role.scope === 'all')
                return true;
            if (!target)
                return true; // has the permission somewhere; no specific tenant addressed
            if (m.role.scope === 'own' && m.tenantId === target)
                return true;
            if (m.role.scope === 'subtree' && (await this.isSelfOrDescendant(target, m.tenantId)))
                return true;
        }
        return false;
    }
    /** True if `targetId` is `ancestorId` or a descendant of it (walk up the tree). */
    async isSelfOrDescendant(targetId, ancestorId) {
        let cur = targetId;
        const seen = new Set();
        while (cur && !seen.has(cur)) {
            if (cur === ancestorId)
                return true;
            seen.add(cur);
            const t = await this.prisma.tenant.findUnique({
                where: { id: cur },
                select: { parentId: true },
            });
            cur = t?.parentId ?? null;
        }
        return false;
    }
};
exports.PermissionsGuard = PermissionsGuard;
exports.PermissionsGuard = PermissionsGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector, prisma_service_1.PrismaService])
], PermissionsGuard);
