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
exports.SmsService = void 0;
const common_1 = require("@nestjs/common");
const provider_config_service_1 = require("./provider-config.service");
/**
 * SMS delivery. The provider is configured in the admin console (Integrations →
 * SMS) and stored via ProviderConfigService — key vault-encrypted — or via the
 * SMS_PROVIDER env var. When nothing is configured we're in DEV: the message
 * (incl. the OTP) is logged instead of sent, and AuthService additionally accepts
 * the fixed dev code 123456.
 *
 * Implemented provider: MSG91 (India, DLT-compliant Flow API). Others fall back to
 * a "queued" stub log until wired.
 */
let SmsService = class SmsService {
    constructor(providers) {
        this.providers = providers;
        this.log = new common_1.Logger('SMS');
    }
    /** True when a real provider is configured (admin config or env). */
    async isEnabled() {
        return !!(await this.providers.effective('sms'));
    }
    async send(mobile, message, vars) {
        const cfg = await this.providers.effective('sms');
        if (!cfg) {
            this.log.log(`[dev] +91${mobile}: ${message}`);
            return { sent: false, dev: true };
        }
        const provider = String(cfg.settings.providerName ?? '').toLowerCase();
        if (provider === 'msg91')
            return this.sendViaMsg91(mobile, cfg, vars);
        // Provider configured but no send implementation yet — don't silently drop.
        this.log.warn(`SMS provider '${provider || 'unknown'}' has no send implementation; message to +91${mobile} not delivered.`);
        return { sent: false, error: `provider '${provider}' not implemented` };
    }
    /**
     * MSG91 Flow API v5 (DLT-compliant). We keep control of the OTP (generated +
     * Redis-stored + verified by us); MSG91 only delivers it via a registered DLT
     * template. Config (Integrations → SMS): providerName=msg91, senderId, templateId,
     * optional otpVar (the template's OTP variable name, default 'otp'), optional
     * apiUrl override; secret apiKey = the MSG91 authkey.
     */
    async sendViaMsg91(mobile, cfg, vars) {
        const authkey = cfg.secrets.apiKey;
        const templateId = cfg.settings.templateId;
        if (!authkey || !templateId) {
            this.log.error('MSG91 is enabled but apiKey and/or templateId are not configured — cannot send.');
            return { sent: false, error: 'msg91 misconfigured (apiKey/templateId)' };
        }
        const url = cfg.settings.apiUrl || 'https://control.msg91.com/api/v5/flow/';
        const otpVar = cfg.settings.otpVar || 'otp';
        const recipient = { mobiles: `91${mobile}` };
        if (vars?.otp)
            recipient[otpVar] = vars.otp;
        const body = { template_id: templateId, short_url: '0', recipients: [recipient] };
        if (cfg.settings.senderId)
            body.sender = cfg.settings.senderId;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { authkey, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            const text = await res.text();
            let json;
            try {
                json = text ? JSON.parse(text) : {};
            }
            catch {
                json = { raw: text };
            }
            if (!res.ok || json?.type === 'error') {
                const reason = json?.message ?? json?.raw ?? `HTTP ${res.status}`;
                this.log.error(`MSG91 send to +91${mobile} failed: ${String(reason).slice(0, 160)}`);
                return { sent: false, error: String(reason).slice(0, 160) };
            }
            this.log.log(`[msg91] delivered to +91${mobile} (${json?.request_id ?? json?.type ?? 'ok'})`);
            return { sent: true };
        }
        catch (e) {
            const msg = e?.name === 'AbortError' ? 'timeout after 10s' : (e?.message ?? String(e));
            this.log.error(`MSG91 send to +91${mobile} error: ${msg}`);
            return { sent: false, error: msg };
        }
        finally {
            clearTimeout(timer);
        }
    }
};
exports.SmsService = SmsService;
exports.SmsService = SmsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [provider_config_service_1.ProviderConfigService])
], SmsService);
