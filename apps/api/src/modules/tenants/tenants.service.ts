import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  /** Public branding/flags view — `flags` is resolved from the settings cascade. */
  private async view(t: any) {
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
    if (!host) return fallback ? this.view(fallback) : null;
    const h = host.toLowerCase().split(':')[0];
    const t = await this.prisma.tenant.findFirst({ where: { customDomain: h } });
    const resolved = t ?? fallback;
    return resolved ? this.view(resolved) : null;
  }
}
