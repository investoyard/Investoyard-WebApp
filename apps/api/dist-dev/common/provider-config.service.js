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
exports.ProviderConfigModule = exports.ProviderConfigService = exports.PROVIDER_SPECS = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const pii_vault_service_1 = require("./pii-vault.service");
/**
 * Field specs the admin UI renders and the server validates loosely against.
 * `secret: true` fields are vault-encrypted; everything else is stored in the clear.
 */
exports.PROVIDER_SPECS = [
    {
        key: 'sms',
        label: 'SMS — OTP delivery',
        fields: [
            { name: 'providerName', label: 'Provider', placeholder: 'msg91' },
            { name: 'senderId', label: 'Sender ID (DLT)', placeholder: 'INVYRD' },
            { name: 'templateId', label: 'DLT template ID (MSG91 Flow)', placeholder: '6XXXXXXXXXXXXXXXXX' },
            { name: 'otpVar', label: 'OTP variable name in template', placeholder: 'otp' },
            { name: 'apiUrl', label: 'API URL (override, optional)', placeholder: 'https://control.msg91.com/api/v5/flow/' },
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
];
const TTL_MS = 30_000;
/**
 * ProviderConfigService — single source of truth for operator integration keys.
 * Admin methods mask secrets; the runtime `effective()` returns decrypted values
 * (short-cached, busted on write) for services like SmsService. A DB row that's
 * enabled wins; otherwise we fall back to the matching env var (dev / bootstrap).
 */
let ProviderConfigService = class ProviderConfigService {
    constructor(prisma, vault) {
        this.prisma = prisma;
        this.vault = vault;
        this.cache = new Map();
    }
    // ---------------------------------------------------------------- admin (masked)
    async list() {
        const rows = await this.prisma.providerConfig.findMany();
        return exports.PROVIDER_SPECS.map((s) => this.view(s.key, rows.find((r) => r.provider === s.key)));
    }
    view(provider, row) {
        const secrets = (row?.secrets ?? {});
        return {
            provider,
            enabled: row?.enabled ?? false,
            settings: (row?.settings ?? {}),
            secretKeys: Object.keys(secrets).filter((k) => !!secrets[k]),
        };
    }
    /** Upsert. Secret values are tokenized; a secret field omitted (or empty) is left as-is. */
    async upsert(provider, dto) {
        if (!exports.PROVIDER_SPECS.some((s) => s.key === provider))
            throw new Error(`Unknown provider '${provider}'`);
        const existing = await this.prisma.providerConfig.findUnique({ where: { provider } });
        const secrets = { ...(existing?.secrets ?? {}) };
        for (const [k, v] of Object.entries(dto.secrets ?? {})) {
            if (typeof v === 'string' && v.length > 0)
                secrets[k] = await this.vault.tokenize(v);
        }
        const settings = dto.settings ?? existing?.settings ?? {};
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
    async effective(provider) {
        const hit = this.cache.get(provider);
        if (hit && Date.now() - hit.at < TTL_MS)
            return hit.val;
        const val = await this.load(provider);
        this.cache.set(provider, { at: Date.now(), val });
        return val;
    }
    async load(provider) {
        const row = await this.prisma.providerConfig.findUnique({ where: { provider } });
        if (row?.enabled) {
            const secrets = {};
            for (const [k, tok] of Object.entries(row.secrets ?? {})) {
                try {
                    secrets[k] = await this.vault.resolve(tok);
                }
                catch { /* skip undecryptable */ }
            }
            return { settings: (row.settings ?? {}), secrets };
        }
        // Env fallback (bootstrap / dev) — keeps behaviour when nothing's saved yet.
        if (provider === 'sms' && process.env.SMS_PROVIDER) {
            return { settings: { providerName: process.env.SMS_PROVIDER }, secrets: {} };
        }
        return null;
    }
};
exports.ProviderConfigService = ProviderConfigService;
exports.ProviderConfigService = ProviderConfigService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, pii_vault_service_1.PiiVaultService])
], ProviderConfigService);
let ProviderConfigModule = class ProviderConfigModule {
};
exports.ProviderConfigModule = ProviderConfigModule;
exports.ProviderConfigModule = ProviderConfigModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [ProviderConfigService, prisma_service_1.PrismaService, pii_vault_service_1.PiiVaultService],
        exports: [ProviderConfigService],
    })
], ProviderConfigModule);
