"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantContext = void 0;
const node_async_hooks_1 = require("node:async_hooks");
const als = new node_async_hooks_1.AsyncLocalStorage();
exports.tenantContext = {
    /** Open a context scope for the duration of `fn` (wrap the request pipeline). */
    run(store, fn) {
        return als.run(store, fn);
    },
    /**
     * Run `fn` with NO tenant in context (empty GUC), so tenant-scoped queries are
     * unscoped. For genuinely cross-tenant operations like login, where a user is
     * identified by a globally-unique key before their home tenant is known.
     */
    runUnscoped(fn) {
        return als.run({}, fn);
    },
    /** The active store, or undefined outside any request (workers, boot). */
    get() {
        return als.getStore();
    },
    /** Merge fields into the active store (e.g. the guard adding userId/tenant). */
    set(patch) {
        const s = als.getStore();
        if (s)
            Object.assign(s, patch);
    },
    tenantId() {
        return als.getStore()?.tenantId;
    },
    /** Tenant id for a scoped WRITE — throws (fail-closed) if there is no context. */
    requireTenantId() {
        const t = als.getStore()?.tenantId;
        if (!t)
            throw new Error('No tenant in context for a tenant-scoped write');
        return t;
    },
    userId() {
        return als.getStore()?.userId;
    },
};
