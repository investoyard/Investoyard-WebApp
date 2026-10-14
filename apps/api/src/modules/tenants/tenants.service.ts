import { Injectable } from '@nestjs/common';
import { TENANT_CONTENT_KEYS, TenantContent } from '@investoyard/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  /**
   * The TenantContent delegate, or `null` when the generated client predates it.
   *
   * THE NULL BRANCH IS A DEPLOY GUARD, NOT TIDINESS. `prisma db push` creates
   * the table while the pool runs, but the delegate only exists after
   * `prisma generate` — which is part of the pool handshake and is exactly the
   * step a hurried deploy skips. Without the guard, `GET /tenants` would throw
   * on `undefined.findMany`, and that endpoint is the PUBLIC registry every
   * single page load resolves its brand from: a missed step would take the whole
   * site down rather than merely leave a footer line blank. It logs, so the
   * cause is findable.
   *
   * The cast goes with it: delete both once the client is regenerated.
   */
  private get contentTable(): any | null {
    const t = (this.prisma as any).tenantContent;
    if (!t) {
      if (!TenantsService.warnedNoContentTable) {
        TenantsService.warnedNoContentTable = true;
        // eslint-disable-next-line no-console
        console.warn('[tenant-content] Prisma client has no TenantContent delegate — run `prisma generate`. Serving empty content.');
      }
      return null;
    }
    return t;
  }
  private static warnedNoContentTable = false;

  /**
   * Fold `TenantContent` rows into `{ identity, contact }` per tenant.
   *
   * Only the known keys are carried. An unrecognised row is DROPPED rather than
   * spread onto the object: this is a public response, and a key written by some
   * later feature must not start appearing on every white-label site the day it
   * is added.
   */
  private static fold(rows: Array<{ tenantId: string; key: string; value: unknown }>): Map<string, TenantContent> {
    const out = new Map<string, TenantContent>();
    for (const r of rows) {
      if (!(TENANT_CONTENT_KEYS as readonly string[]).includes(r.key)) continue;
      const c = out.get(r.tenantId) ?? {};
      (c as any)[r.key] = r.value ?? undefined;
      out.set(r.tenantId, c);
    }
    return out;
  }

  /** Public branding/flags view — `flags` is resolved from the settings cascade. */
  private async view(t: any, content?: TenantContent) {
    return {
      id: t.id, slug: t.slug, type: t.type, name: t.name,
      customDomain: t.customDomain ?? undefined,
      brandColor: t.brandColor ?? undefined,
      goldColor: t.goldColor ?? undefined,
      logoUrl: t.logoUrl ?? undefined,
      flags: await this.settings.publicFlags(t.id),
      /*
       * WHO OPERATES THIS SITE, so a white-label domain stops publishing OURS.
       *
       * Carried on the registry the site already fetches once on mount rather
       * than behind a second request: identity and contact are a handful of
       * short strings, so the whole list costs a few hundred bytes and the
       * footer can render on the first paint. The rich-text keys deliberately
       * do NOT come this way — a reader of the home page must not download
       * every partner's legal prose.
       *
       * Always an object, so a client can read `content.identity` without a
       * guard whatever the tenant has entered.
       */
      content: content ?? {},
    };
  }

  /** Content for one tenant, as the public view wants it. */
  private async contentFor(tenantId: string): Promise<TenantContent> {
    const table = this.contentTable;
    if (!table) return {};
    const rows = await table.findMany({ where: { tenantId } });
    return TenantsService.fold(rows).get(tenantId) ?? {};
  }

  /** All customer-facing channels (direct / partner / branch) — powers web branding. */
  async list() {
    const rows = await this.prisma.tenant.findMany({
      where: { status: 'active', type: { in: ['direct', 'partner', 'branch'] } },
      orderBy: { name: 'asc' },
    });
    /* ONE query for every tenant's content, not one per tenant: this endpoint is
       public, unauthenticated and hit on every first page load. */
    const table = this.contentTable;
    const content = table
      ? TenantsService.fold(await table.findMany({ where: { tenantId: { in: rows.map((t) => t.id) } } }))
      : new Map<string, TenantContent>();
    return Promise.all(rows.map((t) => this.view(t, content.get(t.id))));
  }

  /** Full tenant tree (incl. the platform root) with resolved flags — for the admin console. */
  async tree() {
    const rows = await this.prisma.tenant.findMany({ orderBy: { name: 'asc' } });
    return Promise.all(
      rows.map(async (t) => ({
        id: t.id, slug: t.slug, name: t.name, type: t.type, parentId: t.parentId,
        customDomain: t.customDomain ?? undefined, brandColor: t.brandColor ?? undefined,
        status: t.status, flags: await this.settings.publicFlags(t.id),
      })),
    );
  }

  /**
   * Resolve the active tenant for a request: explicit `x-tenant` slug first, then
   * the Host / custom domain, then the Direct channel as fallback. Returns the id
   * + slug for the request context (not the public branding view).
   */
  async resolveRequestTenant(slug?: string, host?: string): Promise<{ id: string; slug: string } | null> {
    if (slug) {
      const t = await this.prisma.tenant.findFirst({ where: { slug: slug.toLowerCase(), status: 'active' } });
      if (t) return { id: t.id, slug: t.slug };
    }
    if (host) {
      const h = host.toLowerCase().split(':')[0];
      const t = await this.prisma.tenant.findFirst({ where: { customDomain: h } });
      if (t) return { id: t.id, slug: t.slug };
    }
    const def = await this.prisma.tenant.findFirst({ where: { type: 'direct' } });
    return def ? { id: def.id, slug: def.slug } : null;
  }

  /** Resolve a tenant by its custom domain (host). Falls back to the Direct channel. */
  async resolveByHost(host?: string) {
    const fallback = await this.prisma.tenant.findFirst({ where: { type: 'direct' } });
    if (!host) return fallback ? this.view(fallback, await this.contentFor(fallback.id)) : null;
    const h = host.toLowerCase().split(':')[0];
    const t = await this.prisma.tenant.findFirst({ where: { customDomain: h } });
    const resolved = t ?? fallback;
    return resolved ? this.view(resolved, await this.contentFor(resolved.id)) : null;
  }
}
