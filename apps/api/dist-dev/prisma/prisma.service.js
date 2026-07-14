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
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const tenant_context_1 = require("../common/tenant-context");
/**
 * Customer-tenant-owned models (auto-stamped on write; RLS-isolated on read).
 * MemberCredential/Ipo/Tenant/Role are intentionally NOT here — operator/global data.
 */
const SCOPED_MODELS = new Set([
    'User',
    'InvestorProfile',
    'Consent',
    'Application',
    'WatchlistItem',
    'DeviceToken',
]);
/**
 * PrismaService applies tenancy at two layers:
 *   1. App layer — stamps `tenantId` onto writes from the request's tenant context.
 *   2. DB layer  — sets `app.current_tenant_id` (transaction-local) before each
 *      scoped operation so Postgres Row-Level Security admits only that tenant's
 *      rows. The runtime role (investoyard_app) is NOBYPASSRLS, so this is a hard
 *      backstop even against a query that forgot to filter.
 *
 * The GUC is set via a batch `$transaction([set_config, op])`, which guarantees both
 * statements run on the same connection (the canonical Prisma RLS pattern). When
 * there is no tenant context (workers, rail callbacks), operations pass through
 * unwrapped and the policy's "GUC unset ⇒ allow" branch keeps them working.
 *
 * The extended client is exposed transparently through a Proxy so the many existing
 * `this.prisma.<model>` / `this.prisma.$transaction` call sites need no changes.
 */
let PrismaService = class PrismaService extends client_1.PrismaClient {
    constructor() {
        super();
        const base = this;
        this.ext = this.$extends({
            query: {
                $allModels: {
                    async $allOperations({ model, args, query }) {
                        const tid = tenant_context_1.tenantContext.tenantId();
                        if (!model || !SCOPED_MODELS.has(model) || tid == null) {
                            return query(args);
                        }
                        // Run under the tenant GUC so Postgres RLS scopes reads/writes to this
                        // tenant. Writes carry an explicit tenantId (see the feature services);
                        // the policy's WITH CHECK validates it equals this GUC.
                        const [, result] = await base.$transaction([
                            base.$executeRaw `SELECT set_config('app.current_tenant_id', ${tid}, true)`,
                            query(args),
                        ]);
                        return result;
                    },
                },
            },
        });
        // Route model delegates + $-helpers to the extended client; keep Nest lifecycle
        // (onModuleInit) on the base instance.
        return new Proxy(this, {
            get(target, prop, receiver) {
                if (prop === 'onModuleInit')
                    return Reflect.get(target, prop, receiver);
                const ext = target.ext;
                if (ext && prop in ext) {
                    const value = ext[prop];
                    return typeof value === 'function' ? value.bind(ext) : value;
                }
                return Reflect.get(target, prop, receiver);
            },
        });
    }
    async onModuleInit() {
        await this.$connect();
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PrismaService);
