import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ResolvedSetting {
  value: any;
  locked: boolean;   // frozen by this tenant or an ancestor — descendants can't override
  source: string;    // slug of the tenant that set it, or 'default'
}
export type ResolvedSettings = Record<string, ResolvedSetting>;

/**
 * Resolves a tenant's EFFECTIVE settings by cascading feature values down the
 * tenant tree: platform default → each ancestor → the tenant itself. Walking
 * top-down, the nearest setter wins — UNLESS an ancestor marked it `locked`, in
 * which case that value freezes and lower levels are ignored.
 *
 * FeatureDefinition/TenantSetting are operator config (not RLS-scoped), so the
 * resolver can read ancestor tenants' settings freely.
 */
@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  /** Ancestor chain from root (platform) down to and including the tenant. */
  private async ancestorChain(tenantId: string): Promise<{ id: string; slug: string; parentId: string | null }[]> {
    const chain: { id: string; slug: string; parentId: string | null }[] = [];
    let current: string | null = tenantId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      const t: { id: string; slug: string; parentId: string | null } | null =
        await this.prisma.tenant.findUnique({
          where: { id: current },
          select: { id: true, slug: true, parentId: true },
        });
      if (!t) break;
      chain.unshift(t); // prepend → ends up root-first
      current = t.parentId;
    }
    return chain;
  }

  /** Full resolved settings for a tenant (all features). */
  async resolveForTenant(tenantId: string): Promise<ResolvedSettings> {
    const [defs, chain] = await Promise.all([
      this.prisma.featureDefinition.findMany(),
      this.ancestorChain(tenantId),
    ]);
    const tenantIds = chain.map((t) => t.id);
    const rows = tenantIds.length
      ? await this.prisma.tenantSetting.findMany({ where: { tenantId: { in: tenantIds } } })
      : [];
    const byKey = new Map<string, typeof rows[number]>();
    rows.forEach((r) => byKey.set(`${r.tenantId}|${r.featureKey}`, r));

    const out: ResolvedSettings = {};
    for (const def of defs) {
      let value = def.defaultValue;
      let locked = false;
      let source = 'default';
      for (const t of chain) {           // root → tenant
        if (locked) break;               // an ancestor froze this feature
        const s = byKey.get(`${t.id}|${def.key}`);
        if (s) {
          value = s.value;
          source = t.slug;
          if (s.locked) locked = true;
        }
      }
      out[def.key] = { value, locked, source };
    }
    return out;
  }

  /** Public-facing flags only (isPublic features), flattened to `{ key: value }`. */
  async publicFlags(tenantId: string): Promise<Record<string, any>> {
    const [defs, resolved] = await Promise.all([
      this.prisma.featureDefinition.findMany({ where: { isPublic: true }, select: { key: true } }),
      this.resolveForTenant(tenantId),
    ]);
    const flags: Record<string, any> = {};
    for (const d of defs) if (resolved[d.key]) flags[d.key] = resolved[d.key].value;
    return flags;
  }

  /** Resolve by slug — for the admin/settings endpoint. */
  async resolveBySlug(slug: string): Promise<{ tenant: { id: string; slug: string; name: string }; settings: ResolvedSettings }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true },
    });
    if (!tenant) throw new NotFoundException(`Tenant '${slug}' not found`);
    return { tenant, settings: await this.resolveForTenant(tenant.id) };
  }

  /** The feature catalog (definitions + platform defaults). */
  listFeatures() {
    return this.prisma.featureDefinition.findMany({ orderBy: { key: 'asc' } });
  }

  private async tenantBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) throw new NotFoundException(`Tenant '${slug}' not found`);
    return tenant;
  }

  private coerce(valueType: string, value: any): any {
    if (valueType === 'boolean') return typeof value === 'string' ? value === 'true' : !!value;
    if (valueType === 'number') return typeof value === 'string' ? Number(value) : value;
    return value; // string
  }

  /** Set (or update) a tenant's override for one feature. Returns the re-resolved settings. */
  async setOverride(slug: string, key: string, value: any, locked: boolean) {
    const tenant = await this.tenantBySlug(slug);
    const feature = await this.prisma.featureDefinition.findUnique({ where: { key } });
    if (!feature) throw new NotFoundException(`Feature '${key}' not found`);
    const coerced = this.coerce(feature.valueType, value);
    await this.prisma.tenantSetting.upsert({
      where: { tenantId_featureKey: { tenantId: tenant.id, featureKey: key } },
      update: { value: coerced, locked: !!locked },
      create: { tenantId: tenant.id, featureKey: key, value: coerced, locked: !!locked },
    });
    return this.resolveForTenant(tenant.id);
  }

  /** Clear a tenant's override for a feature (falls back to inherited/default). */
  async clearOverride(slug: string, key: string) {
    const tenant = await this.tenantBySlug(slug);
    await this.prisma.tenantSetting.deleteMany({ where: { tenantId: tenant.id, featureKey: key } });
    return this.resolveForTenant(tenant.id);
  }
}
