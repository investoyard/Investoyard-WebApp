import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantContext } from '../common/tenant-context';

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
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly ext: any;

  constructor() {
    super();
    const base = this;
    this.ext = this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, args, query }: any) {
            const tid = tenantContext.tenantId();
            if (!model || !SCOPED_MODELS.has(model) || tid == null) {
              return query(args);
            }
            // Run under the tenant GUC so Postgres RLS scopes reads/writes to this
            // tenant. Writes carry an explicit tenantId (see the feature services);
            // the policy's WITH CHECK validates it equals this GUC.
            const [, result] = await base.$transaction([
              base.$executeRaw`SELECT set_config('app.current_tenant_id', ${tid}, true)`,
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
      get(target: any, prop, receiver) {
        if (prop === 'onModuleInit') return Reflect.get(target, prop, receiver);
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
}
