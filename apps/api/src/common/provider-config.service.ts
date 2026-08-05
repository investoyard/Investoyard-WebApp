import { ForbiddenException, Global, Injectable, Module, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PiiVaultService } from './pii-vault.service';

/** Platform-default config lives under this tenant id; white-label tenants override it. */
export const PLATFORM_TENANT = 't-platform';

/**
 * Field specs the admin UI renders and the server validates loosely against.
 * `secret: true` fields are vault-encrypted; everything else is stored in the clear.
 */
export const PROVIDER_SPECS = [
  {
    key: 'sms',
    label: 'SMS — OTP delivery',
    // Universal gateway config: any provider's HTTP send-URL with {placeholders}.
    // Credentials are typed straight into the URL; the URL is sealed (encrypted at
    // rest, but shown back to authorized admins — see SEALED_SETTINGS).
    fields: [
      { name: 'providerName', label: 'Provider', placeholder: 'your gateway name' },
      { name: 'apiUrl', label: 'URL', placeholder: 'https://…?user=U&pass=P&destination=91{mobile}&message={message}' },
      { name: 'successText', label: 'Response', placeholder: '1701' },
    ],
    secretFields: [],
  },
  {
    key: 'push',
    label: 'Push notifications — FCM / APNs',
    fields: [{ name: 'projectId', label: 'FCM project ID' }],
    secretFields: [{ name: 'serverKey', label: 'Server key / service-account JSON' }],
  },
  {
    key: 'email',
    label: 'Email — transactional & notifications',
    fields: [
      { name: 'providerName', label: 'Provider', placeholder: 'smtp / sendgrid / ses / postmark' },
      { name: 'host', label: 'SMTP host', placeholder: 'smtp.example.com' },
      { name: 'port', label: 'SMTP port', placeholder: '587' },
      { name: 'username', label: 'SMTP username', placeholder: 'apikey / user@domain' },
      { name: 'fromEmail', label: 'From email', placeholder: 'no-reply@investoyard.com' },
      { name: 'fromName', label: 'From name', placeholder: 'Investoyard' },
    ],
    secretFields: [{ name: 'password', label: 'SMTP password / API key' }],
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp — Business Cloud API',
    fields: [
      { name: 'providerName', label: 'Provider', placeholder: 'meta-cloud / gupshup' },
      { name: 'phoneNumberId', label: 'Phone number ID' },
      { name: 'businessAccountId', label: 'WhatsApp Business Account (WABA) ID' },
      { name: 'apiUrl', label: 'Graph API base (override, optional)', placeholder: 'https://graph.facebook.com/v20.0' },
      { name: 'webhookVerifyToken', label: 'Webhook verify token' },
    ],
    secretFields: [
      { name: 'accessToken', label: 'Permanent access token' },
      { name: 'appSecret', label: 'App secret (webhook signature)' },
    ],
  },
  {
    key: 'ai',
    label: 'Claude AI — chatbot brain (Level 2)',
    fields: [
      { name: 'model', label: 'Model', placeholder: 'claude-opus-4-8' },
      { name: 'maxTokens', label: 'Max reply tokens', placeholder: '600' },
    ],
    secretFields: [{ name: 'apiKey', label: 'Anthropic API key (sk-ant-…)' }],
  },
] as const;

export type ProviderKey = (typeof PROVIDER_SPECS)[number]['key'];

/**
 * Settings fields that embed credentials (e.g. the SMS gateway URL with the
 * password typed inside). Sealed = vault-encrypted at rest, but — unlike
 * secretFields — decrypted and shown back to authorized admins so the platform
 * admin can view/edit every partner's gateway config.
 */
const SEALED_SETTINGS: Record<string, string[]> = { sms: ['apiUrl'] };

export interface ProviderView {
  provider: string;
  enabled: boolean;
  /** a config row exists at this scope (vs. purely inheriting the parent/platform) */
  exists: boolean;
  settings: Record<string, any>;
  secretKeys: string[]; // which secret fields are set (names only — never the values)
}

/** Decrypted, server-only view of a provider's effective config (or null = not configured). */
export interface EffectiveConfig {
  settings: Record<string, any>;
  secrets: Record<string, string>;
}

const TTL_MS = 30_000;

/**
 * ProviderConfigService — single source of truth for operator integration keys.
 * Admin methods mask secrets; the runtime `effective()` returns decrypted values
 * (short-cached, busted on write) for services like SmsService. A DB row that's
 * enabled wins; otherwise we fall back to the matching env var (dev / bootstrap).
 */
@Injectable()
export class ProviderConfigService {
  private cache = new Map<string, { at: number; val: EffectiveConfig | null }>();

  constructor(private prisma: PrismaService, private vault: PiiVaultService) {}

  // ---------------------------------------------------------------- admin (masked)
  /** Platform-default providers (back-compat: unscoped list = the platform tenant). */
  list(): Promise<ProviderView[]> {
    return this.listForTenant(PLATFORM_TENANT);
  }

  /** A tenant's OWN configured providers (empty ⇒ it inherits the platform default). */
  async listForTenant(tenantId: string): Promise<ProviderView[]> {
    const rows = await this.prisma.providerConfig.findMany({ where: { tenantId } });
    return Promise.all(PROVIDER_SPECS.map((s) => this.view(s.key, rows.find((r) => r.provider === s.key))));
  }

  private async view(provider: string, row?: { enabled: boolean; settings: any; secrets: any } | null): Promise<ProviderView> {
    const secrets = (row?.secrets ?? {}) as Record<string, string>;
    return {
      provider,
      enabled: row?.enabled ?? false,
      exists: !!row, // a config row exists at THIS scope (vs. purely inheriting)
      settings: await this.unsealSettings(provider, (row?.settings ?? {}) as Record<string, any>),
      secretKeys: Object.keys(secrets).filter((k) => !!secrets[k]),
    };
  }

  /** Decrypt sealed settings fields for display / runtime use (plain values pass through). */
  private async unsealSettings(provider: string, settings: Record<string, any>): Promise<Record<string, any>> {
    const sealed = SEALED_SETTINGS[provider];
    if (!sealed?.length) return settings;
    const out = { ...settings };
    for (const f of sealed) {
      const v = out[f];
      if (typeof v === 'string' && v.startsWith('v2:')) {
        try { out[f] = await this.vault.resolve(v); } catch { out[f] = ''; }
      }
    }
    return out;
  }

  /** Remove a tenant's own config row → it re-inherits the parent/platform default. */
  async deleteForTenant(tenantId: string, provider: string): Promise<{ deleted: boolean }> {
    await this.assertConfigurable(tenantId);
    const r = await this.prisma.providerConfig.deleteMany({ where: { tenantId, provider } });
    this.cache.clear();
    return { deleted: r.count > 0 };
  }

  /** Platform-default upsert (back-compat). */
  upsert(provider: string, dto: { enabled?: boolean; settings?: Record<string, any>; secrets?: Record<string, string> }): Promise<ProviderView> {
    return this.upsertForTenant(PLATFORM_TENANT, provider, dto);
  }

  /**
   * Upsert a provider config for a tenant. Only the platform tenant or a WHITE-LABEL
   * tenant (flags.whitelabel) may hold its own config. Secret values are tokenized;
   * a secret field omitted (or empty) is left as-is.
   */
  async upsertForTenant(
    tenantId: string,
    provider: string,
    dto: { enabled?: boolean; settings?: Record<string, any>; secrets?: Record<string, string> },
  ): Promise<ProviderView> {
    if (!PROVIDER_SPECS.some((s) => s.key === provider)) throw new Error(`Unknown provider '${provider}'`);
    await this.assertConfigurable(tenantId);
    const where = { tenantId_provider: { tenantId, provider } };
    const existing = await this.prisma.providerConfig.findUnique({ where });
    const secrets: Record<string, string> = { ...((existing?.secrets as any) ?? {}) };
    for (const [k, v] of Object.entries(dto.secrets ?? {})) {
      if (typeof v === 'string' && v.length > 0) secrets[k] = await this.vault.tokenize(v);
    }
    const settings: Record<string, any> = { ...(dto.settings ?? (existing?.settings as any) ?? {}) };
    for (const f of SEALED_SETTINGS[provider] ?? []) {
      const v = settings[f];
      if (typeof v === 'string' && v.length > 0 && !v.startsWith('v2:')) settings[f] = await this.vault.tokenize(v);
    }
    const enabled = dto.enabled ?? existing?.enabled ?? false;
    const row = await this.prisma.providerConfig.upsert({
      where,
      create: { tenantId, provider, enabled, settings, secrets },
      update: { enabled, settings, secrets },
    });
    this.cache.clear(); // children inherit — bust everything (small cache, 30s TTL)
    return this.view(provider, row);
  }

  /** Platform tenant, or a tenant flagged white-label, may configure its own providers. */
  private async assertConfigurable(tenantId: string): Promise<void> {
    if (tenantId === PLATFORM_TENANT) return;
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { flags: true } });
    if (!t) throw new NotFoundException('Tenant not found');
    if (!(t.flags as any)?.whitelabel) {
      throw new ForbiddenException('Only white-label tenants can configure their own provider keys.');
    }
  }

  // ---------------------------------------------------------------- runtime (decrypted)
  /**
   * Effective config for a provider, resolved for a tenant: the nearest ENABLED config
   * walking tenant → parent → … → platform; else the env fallback. Unscoped calls
   * resolve against the platform default (back-compat).
   */
  async effective(provider: string, tenantId: string = PLATFORM_TENANT): Promise<EffectiveConfig | null> {
    const key = `${tenantId}:${provider}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.val;
    const val = await this.load(provider, tenantId);
    this.cache.set(key, { at: Date.now(), val });
    return val;
  }

  private async load(provider: string, tenantId: string): Promise<EffectiveConfig | null> {
    const chain = await this.tenantChain(tenantId);
    const rows = await this.prisma.providerConfig.findMany({ where: { provider, tenantId: { in: chain } } });
    const byTenant = new Map(rows.map((r) => [r.tenantId, r]));
    for (const tid of chain) {
      const row = byTenant.get(tid);
      if (row?.enabled) {
        const secrets: Record<string, string> = {};
        for (const [k, tok] of Object.entries((row.secrets as any) ?? {})) {
          try { secrets[k] = await this.vault.resolve(tok as string); } catch { /* skip undecryptable */ }
        }
        return { settings: await this.unsealSettings(provider, ((row.settings as any) ?? {}) as Record<string, any>), secrets };
      }
    }
    // Env fallback (bootstrap / dev) — keeps behaviour when nothing's saved yet.
    if (provider === 'sms' && process.env.SMS_PROVIDER) {
      return { settings: { providerName: process.env.SMS_PROVIDER }, secrets: {} };
    }
    return null;
  }

  /** tenantId → [tenantId, parent, … , platform] (bounded, platform always last). */
  private async tenantChain(tenantId: string): Promise<string[]> {
    const chain: string[] = [];
    let cur: string | null = tenantId;
    for (let i = 0; i < 6 && cur; i++) {
      if (!chain.includes(cur)) chain.push(cur);
      if (cur === PLATFORM_TENANT) break;
      const t: { parentId: string | null } | null = await this.prisma.tenant.findUnique({ where: { id: cur }, select: { parentId: true } });
      cur = t?.parentId ?? null;
    }
    if (!chain.includes(PLATFORM_TENANT)) chain.push(PLATFORM_TENANT);
    return chain;
  }
}

@Global()
@Module({
  providers: [ProviderConfigService, PrismaService, PiiVaultService],
  exports: [ProviderConfigService],
})
export class ProviderConfigModule {}
