import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PiiVaultService } from './pii-vault.service';

/**
 * Field specs the admin UI renders and the server validates loosely against.
 * `secret: true` fields are vault-encrypted; everything else is stored in the clear.
 */
export const PROVIDER_SPECS = [
  {
    key: 'sms',
    label: 'SMS — OTP delivery',
    fields: [
      { name: 'providerName', label: 'Provider', placeholder: 'msg91 / gupshup / twilio' },
      { name: 'senderId', label: 'Sender ID (DLT)', placeholder: 'INVYRD' },
    ],
    secretFields: [
      { name: 'apiKey', label: 'API key' },
      { name: 'apiSecret', label: 'API secret / auth token (if any)' },
    ],
  },
  {
    key: 'push',
    label: 'Push notifications — FCM / APNs',
    fields: [{ name: 'projectId', label: 'FCM project ID' }],
    secretFields: [{ name: 'serverKey', label: 'Server key / service-account JSON' }],
  },
] as const;

export type ProviderKey = (typeof PROVIDER_SPECS)[number]['key'];

export interface ProviderView {
  provider: string;
  enabled: boolean;
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
  async list(): Promise<ProviderView[]> {
    const rows = await this.prisma.providerConfig.findMany();
    return PROVIDER_SPECS.map((s) => this.view(s.key, rows.find((r) => r.provider === s.key)));
  }

  private view(provider: string, row?: { enabled: boolean; settings: any; secrets: any } | null): ProviderView {
    const secrets = (row?.secrets ?? {}) as Record<string, string>;
    return {
      provider,
      enabled: row?.enabled ?? false,
      settings: (row?.settings ?? {}) as Record<string, any>,
      secretKeys: Object.keys(secrets).filter((k) => !!secrets[k]),
    };
  }

  /** Upsert. Secret values are tokenized; a secret field omitted (or empty) is left as-is. */
  async upsert(
    provider: string,
    dto: { enabled?: boolean; settings?: Record<string, any>; secrets?: Record<string, string> },
  ): Promise<ProviderView> {
    if (!PROVIDER_SPECS.some((s) => s.key === provider)) throw new Error(`Unknown provider '${provider}'`);
    const existing = await this.prisma.providerConfig.findUnique({ where: { provider } });
    const secrets: Record<string, string> = { ...((existing?.secrets as any) ?? {}) };
    for (const [k, v] of Object.entries(dto.secrets ?? {})) {
      if (typeof v === 'string' && v.length > 0) secrets[k] = await this.vault.tokenize(v);
    }
    const settings = dto.settings ?? (existing?.settings as any) ?? {};
    const enabled = dto.enabled ?? existing?.enabled ?? false;
    const row = await this.prisma.providerConfig.upsert({
      where: { provider },
      create: { provider, enabled, settings, secrets },
      update: { enabled, settings, secrets },
    });
    this.cache.delete(provider);
    return this.view(provider, row);
  }

  // ---------------------------------------------------------------- runtime (decrypted)
  async effective(provider: string): Promise<EffectiveConfig | null> {
    const hit = this.cache.get(provider);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.val;
    const val = await this.load(provider);
    this.cache.set(provider, { at: Date.now(), val });
    return val;
  }

  private async load(provider: string): Promise<EffectiveConfig | null> {
    const row = await this.prisma.providerConfig.findUnique({ where: { provider } });
    if (row?.enabled) {
      const secrets: Record<string, string> = {};
      for (const [k, tok] of Object.entries((row.secrets as any) ?? {})) {
        try { secrets[k] = await this.vault.resolve(tok as string); } catch { /* skip undecryptable */ }
      }
      return { settings: ((row.settings as any) ?? {}) as Record<string, any>, secrets };
    }
    // Env fallback (bootstrap / dev) — keeps behaviour when nothing's saved yet.
    if (provider === 'sms' && process.env.SMS_PROVIDER) {
      return { settings: { providerName: process.env.SMS_PROVIDER }, secrets: {} };
    }
    return null;
  }
}

@Global()
@Module({
  providers: [ProviderConfigService, PrismaService, PiiVaultService],
  exports: [ProviderConfigService],
})
export class ProviderConfigModule {}
