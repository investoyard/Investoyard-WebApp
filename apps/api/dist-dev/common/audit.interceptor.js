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
exports.AuditInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
const prisma_service_1 = require("../prisma/prisma.service");
/** Map a mutating request (method + path, global /api prefix stripped) to an audit action. */
function derive(method, path, params) {
    const p = path.replace(/^\/api/, '').split('?')[0];
    const seg = p.split('/').filter(Boolean); // e.g. ['admin','roles','abc']
    const M = method.toUpperCase();
    if (seg[0] === 'admin' && seg[1] === 'roles') {
        if (M === 'POST')
            return { action: 'role.create', targetType: 'role' };
        if (M === 'PATCH')
            return { action: 'role.update', targetType: 'role', targetId: params.id };
        if (M === 'DELETE')
            return { action: 'role.delete', targetType: 'role', targetId: params.id };
    }
    if (seg[0] === 'admin' && seg[1] === 'members') {
        if (M === 'POST')
            return { action: 'member.add', targetType: 'member', tenantSlug: params.slug };
        if (M === 'PATCH')
            return { action: 'member.update', targetType: 'member', targetId: params.membershipId, tenantSlug: params.slug };
    }
    if (seg[0] === 'ipos') {
        if (M === 'POST')
            return { action: 'ipo.create', targetType: 'ipo' };
        if (M === 'PATCH')
            return { action: 'ipo.update', targetType: 'ipo', targetId: params.id };
    }
    if (seg[0] === 'settings' && params.key) {
        if (M === 'PUT')
            return { action: 'setting.set', targetType: 'setting', targetId: params.key, tenantSlug: params.slug };
        if (M === 'DELETE')
            return { action: 'setting.clear', targetType: 'setting', targetId: params.key, tenantSlug: params.slug };
    }
    if (seg[0] === 'applications' && seg[2] === 'allotment' && M === 'POST') {
        return { action: 'allotment.record', targetType: 'application', targetId: params.id };
    }
    return null;
}
/** A short human label for the target, from the response/request body. */
function labelOf(d, body, resp) {
    switch (d.targetType) {
        case 'role': return resp?.name ?? body?.name;
        case 'ipo': return resp?.symbol ?? body?.symbol;
        case 'member': return body?.name ?? body?.mobile;
        case 'setting': return d.targetId;
        case 'application': return body?.allottedLots != null ? `allotted ${body.allottedLots} lot(s)` : undefined;
        default: return undefined;
    }
}
/**
 * Records successful operator mutations to AuditLog. Global interceptor; only known
 * write routes are audited, and recording is best-effort (never fails the request).
 */
let AuditInterceptor = class AuditInterceptor {
    constructor(prisma) {
        this.prisma = prisma;
    }
    intercept(ctx, next) {
        const req = ctx.switchToHttp().getRequest();
        if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method))
            return next.handle();
        const d = derive(req.method, req.originalUrl ?? req.url ?? '', req.params ?? {});
        if (!d)
            return next.handle();
        return next.handle().pipe((0, operators_1.tap)((resp) => {
            this.prisma.auditLog.create({
                data: {
                    actorId: req.user?.sub ?? null,
                    actorMobile: req.user?.mobile ?? null,
                    action: d.action,
                    targetType: d.targetType ?? null,
                    targetId: d.targetId ?? null,
                    targetLabel: labelOf(d, req.body, resp) ?? null,
                    tenantSlug: d.tenantSlug ?? null,
                },
            }).catch(() => { });
        }));
    }
};
exports.AuditInterceptor = AuditInterceptor;
exports.AuditInterceptor = AuditInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuditInterceptor);
