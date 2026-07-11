import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request tenant context, propagated via AsyncLocalStorage.
 *
 * Populated by TenantMiddleware (inbound brand, from `x-tenant` header or Host)
 * and refined by JwtAuthGuard (the logged-in user's authoritative home tenant).
 * Read by PrismaService's tenant middleware to auto-stamp writes and scope reads.
 *
 * It's a module singleton rather than a Nest provider: ALS is inherently
 * process-global, and PrismaService is instantiated many times across modules —
 * a singleton avoids threading DI through every one of them.
 */
export interface TenantStore {
  tenantId?: string | null;
  tenantSlug?: string | null;
  userId?: string | null;
}

const als = new AsyncLocalStorage<TenantStore>();

export const tenantContext = {
  /** Open a context scope for the duration of `fn` (wrap the request pipeline). */
  run<T>(store: TenantStore, fn: () => T): T {
    return als.run(store, fn);
  },
  /**
   * Run `fn` with NO tenant in context (empty GUC), so tenant-scoped queries are
   * unscoped. For genuinely cross-tenant operations like login, where a user is
   * identified by a globally-unique key before their home tenant is known.
   */
  runUnscoped<T>(fn: () => T): T {
    return als.run({}, fn);
  },
  /** The active store, or undefined outside any request (workers, boot). */
  get(): TenantStore | undefined {
    return als.getStore();
  },
  /** Merge fields into the active store (e.g. the guard adding userId/tenant). */
  set(patch: Partial<TenantStore>): void {
    const s = als.getStore();
    if (s) Object.assign(s, patch);
  },
  tenantId(): string | null | undefined {
    return als.getStore()?.tenantId;
  },
  /** Tenant id for a scoped WRITE — throws (fail-closed) if there is no context. */
  requireTenantId(): string {
    const t = als.getStore()?.tenantId;
    if (!t) throw new Error('No tenant in context for a tenant-scoped write');
    return t;
  },
  userId(): string | null | undefined {
    return als.getStore()?.userId;
  },
};
