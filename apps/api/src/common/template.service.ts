import { BadRequestException, ConflictException, ForbiddenException, Global, Injectable, Logger, Module, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PLATFORM_TENANT } from './provider-config.service';

/** Catalog of message types the app can send (drives the admin Templates UI + validation). */
export interface MessageKeySpec {
  channel: 'sms' | 'email' | 'whatsapp';
  key: string;
  label: string;
  vars: string[]; // variables the caller supplies (rendered into {{var}} placeholders)
}
export const MESSAGE_KEYS: MessageKeySpec[] = [
  { channel: 'sms', key: 'otp', label: 'Login OTP', vars: ['otp'] },
  { channel: 'sms', key: 'whatsapp_verify', label: 'WhatsApp verification code', vars: ['otp'] },
  { channel: 'email', key: 'empanelment', label: 'Empanelment form email', vars: ['name', 'code'] },
];

export interface ResolvedTemplate {
  tenantId: string; // where it resolved from
  channel: string;
  key: string;
  locale: string;
  dltTemplateId?: string | null;
  senderId?: string | null;
  body?: string | null;
  subject?: string | null;
  bodyHtml?: string | null;
}

/** Platform-default template content, seeded once (never overwrites operator edits). */
const DEFAULTS: Array<{ channel: string; key: string; locale: string; body?: string; subject?: string; bodyHtml?: string }> = [
  { channel: 'sms', key: 'otp', locale: 'en', body: 'Your Investoyard OTP is {{otp}}. Valid for 5 minutes.' },
  { channel: 'sms', key: 'whatsapp_verify', locale: 'en', body: 'Your Investoyard verification code is {{otp}}' },
  { channel: 'email', key: 'empanelment', locale: 'en', subject: 'Investoyard — Business Associate Empanelment Form', bodyHtml: '<p>Dear {{name}},</p><p>Please find your Business Associate empanelment form attached.</p>' },
];

/**
 * TemplateService — the message-template registry. Templates resolve per tenant the
 * same way provider config does: nearest override walking tenant → parent → platform,
 * with the requested locale falling back to English. Shared platform templates with
 * per-(white-label)-tenant overrides.
 */
@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly log = new Logger('Templates');

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedTypes();
    await this.seedDefaults();
  }

  /** Seed the built-in message types (system = protected) if missing — never clobbers edits. */
  private async seedTypes() {
    for (const k of MESSAGE_KEYS) {
      try {
        const where = { channel_key: { channel: k.channel, key: k.key } };
        if (!(await this.prisma.messageType.findUnique({ where }))) {
          await this.prisma.messageType.create({ data: { channel: k.channel, key: k.key, label: k.label, vars: k.vars, system: true } });
        }
      } catch (e: any) { this.log.warn(`seed type ${k.channel}/${k.key} failed: ${e.message}`); }
    }
  }

  // ── message-type catalog (operator-managed; platform-level) ──────────────────
  listTypes() {
    return this.prisma.messageType.findMany({ orderBy: [{ channel: 'asc' }, { key: 'asc' }] });
  }

  async createType(dto: { channel: string; key: string; label: string; description?: string; vars?: string[] }) {
    if (!['sms', 'email', 'whatsapp'].includes(dto.channel)) throw new BadRequestException('Invalid channel');
    const key = String(dto.key || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(key)) throw new BadRequestException('key must be 2–40 lowercase letters/digits/underscore');
    if (!dto.label?.trim()) throw new BadRequestException('label is required');
    if (await this.prisma.messageType.findUnique({ where: { channel_key: { channel: dto.channel, key } } })) {
      throw new ConflictException(`A ${dto.channel} template named '${key}' already exists.`);
    }
    return this.prisma.messageType.create({
      data: { channel: dto.channel, key, label: dto.label.trim(), description: dto.description ?? null, vars: dto.vars ?? [], system: false },
    });
  }

  async updateType(id: string, dto: { label?: string; description?: string; vars?: string[] }) {
    const t = await this.prisma.messageType.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Message type not found');
    return this.prisma.messageType.update({
      where: { id },
      data: { label: dto.label ?? t.label, description: dto.description ?? t.description, vars: dto.vars ?? t.vars },
    });
  }

  async deleteType(id: string) {
    const t = await this.prisma.messageType.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Message type not found');
    if (t.system) throw new ForbiddenException('Built-in message types cannot be deleted.');
    // remove its content everywhere (platform + all tenants), then the type
    await this.prisma.messageTemplate.deleteMany({ where: { channel: t.channel, key: t.key } });
    await this.prisma.messageType.delete({ where: { id } });
    return { deleted: true };
  }

  /** Create the platform defaults if missing — idempotent, never clobbers edits. */
  private async seedDefaults() {
    for (const d of DEFAULTS) {
      try {
        const where = { tenantId_channel_key_locale: { tenantId: PLATFORM_TENANT, channel: d.channel, key: d.key, locale: d.locale } };
        if (!(await this.prisma.messageTemplate.findUnique({ where }))) {
          await this.prisma.messageTemplate.create({ data: { tenantId: PLATFORM_TENANT, ...d } });
        }
      } catch (e: any) {
        this.log.warn(`seed ${d.channel}/${d.key} failed: ${e.message}`);
      }
    }
  }

  /** Resolve a template for a tenant: nearest tenant→parent→platform, requested locale → 'en'. */
  async resolve(channel: string, key: string, tenantId: string = PLATFORM_TENANT, locale = 'en'): Promise<ResolvedTemplate | null> {
    const chain = await this.tenantChain(tenantId);
    const rows = await this.prisma.messageTemplate.findMany({
      where: { channel, key, enabled: true, tenantId: { in: chain }, locale: { in: [locale, 'en'] } },
    });
    for (const tid of chain) {
      const exact = rows.find((r) => r.tenantId === tid && r.locale === locale);
      if (exact) return this.view(exact);
      const en = rows.find((r) => r.tenantId === tid && r.locale === 'en');
      if (en) return this.view(en);
    }
    return null;
  }

  private view(r: any): ResolvedTemplate {
    return { tenantId: r.tenantId, channel: r.channel, key: r.key, locale: r.locale, dltTemplateId: r.dltTemplateId, senderId: r.senderId, body: r.body, subject: r.subject, bodyHtml: r.bodyHtml };
  }

  /** A tenant's OWN template overrides (empty ⇒ it inherits platform). */
  listForTenant(tenantId: string) {
    return this.prisma.messageTemplate.findMany({ where: { tenantId }, orderBy: [{ channel: 'asc' }, { key: 'asc' }, { locale: 'asc' }] });
  }

  /** Upsert a template override — gated to platform + white-label tenants. */
  async upsertForTenant(
    tenantId: string,
    t: { channel: string; key: string; locale?: string; enabled?: boolean; dltTemplateId?: string; senderId?: string; body?: string; subject?: string; bodyHtml?: string },
  ) {
    if (!(await this.prisma.messageType.findUnique({ where: { channel_key: { channel: t.channel, key: t.key } } }))) {
      throw new BadRequestException(`Unknown template ${t.channel}/${t.key}`);
    }
    await this.assertConfigurable(tenantId);
    const locale = t.locale ?? 'en';
    const where = { tenantId_channel_key_locale: { tenantId, channel: t.channel, key: t.key, locale } };
    const data = { enabled: t.enabled, dltTemplateId: t.dltTemplateId, senderId: t.senderId, body: t.body, subject: t.subject, bodyHtml: t.bodyHtml };
    return this.prisma.messageTemplate.upsert({ where, create: { tenantId, channel: t.channel, key: t.key, locale, ...data }, update: data });
  }

  private async assertConfigurable(tenantId: string): Promise<void> {
    if (tenantId === PLATFORM_TENANT) return;
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { flags: true } });
    if (!t) throw new NotFoundException('Tenant not found');
    if (!(t.flags as any)?.whitelabel) throw new ForbiddenException('Only white-label tenants can override templates.');
  }

  /**
   * Delete one template row (tenant override → re-inherits platform; platform → drops
   * that locale variant — system defaults re-seed on next boot). No-op if absent.
   */
  async deleteForTenant(tenantId: string, q: { channel: string; key: string; locale?: string }) {
    await this.assertConfigurable(tenantId);
    const r = await this.prisma.messageTemplate.deleteMany({
      where: { tenantId, channel: q.channel, key: q.key, locale: q.locale ?? 'en' },
    });
    return { deleted: r.count > 0 };
  }

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

  /** Render {{var}} placeholders in a string with the given vars. */
  static render(tpl: string | null | undefined, vars: Record<string, any> = {}): string {
    if (!tpl) return '';
    return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
  }
}

@Global()
@Module({ providers: [TemplateService, PrismaService], exports: [TemplateService] })
export class TemplateModule {}
