"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PiiVaultService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
/** Dev: DEK wrapped with a local AES-256-GCM master key from PII_VAULT_KEY. */
class LocalKeyProvider {
    constructor() {
        this.name = 'local';
        this.master = (0, crypto_1.createHash)('sha256').update(process.env.PII_VAULT_KEY ?? 'dev-only-key').digest();
    }
    async generateDataKey() {
        const plaintextKey = (0, crypto_1.randomBytes)(32);
        const iv = (0, crypto_1.randomBytes)(12);
        const c = (0, crypto_1.createCipheriv)('aes-256-gcm', this.master, iv);
        const enc = Buffer.concat([c.update(plaintextKey), c.final()]);
        const wrapped = Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
        return { plaintextKey, wrapped };
    }
    async unwrapDataKey(wrapped) {
        const buf = Buffer.from(wrapped, 'base64');
        const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
        const d = (0, crypto_1.createDecipheriv)('aes-256-gcm', this.master, iv);
        d.setAuthTag(tag);
        return Buffer.concat([d.update(enc), d.final()]);
    }
}
/** Prod: DEK generated/unwrapped by AWS KMS — the master key never leaves KMS. */
class AwsKmsProvider {
    constructor(keyId) {
        this.keyId = keyId;
        this.name = 'kms';
    }
    /** Load the SDK at runtime (prod-only dep — `npm i @aws-sdk/client-kms` + AWS creds/role). */
    async load() {
        if (!this.sdk) {
            const modName = '@aws-sdk/client-kms'; // variable specifier: no compile-time resolution
            this.sdk = await Promise.resolve(`${modName}`).then(s => __importStar(require(s)));
            this.client = new this.sdk.KMSClient({});
        }
        return this.sdk;
    }
    async generateDataKey() {
        const sdk = await this.load();
        const res = await this.client.send(new sdk.GenerateDataKeyCommand({ KeyId: this.keyId, KeySpec: 'AES_256' }));
        return { plaintextKey: Buffer.from(res.Plaintext), wrapped: Buffer.from(res.CiphertextBlob).toString('base64') };
    }
    async unwrapDataKey(wrapped) {
        const sdk = await this.load();
        const res = await this.client.send(new sdk.DecryptCommand({ CiphertextBlob: Buffer.from(wrapped, 'base64') }));
        return Buffer.from(res.Plaintext);
    }
}
let PiiVaultService = class PiiVaultService {
    constructor() {
        this.log = new common_1.Logger('Vault');
        this.local = new LocalKeyProvider(); // always available for v1 + local v2 tokens
        this.legacyKey = (0, crypto_1.createHash)('sha256').update(process.env.PII_VAULT_KEY ?? 'dev-only-key').digest();
        this.provider = process.env.KMS_KEY_ID ? new AwsKmsProvider(process.env.KMS_KEY_ID) : this.local;
        this.log.log(`PII vault provider: ${this.provider.name}${this.provider.name === 'local' ? ' (dev — set KMS_KEY_ID for AWS KMS)' : ''}`);
    }
    /** Envelope-encrypt a value → opaque v2 token ref. */
    async tokenize(plaintext) {
        const { plaintextKey, wrapped } = await this.provider.generateDataKey();
        const iv = (0, crypto_1.randomBytes)(12);
        const c = (0, crypto_1.createCipheriv)('aes-256-gcm', plaintextKey, iv);
        const enc = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
        plaintextKey.fill(0); // don't keep the DEK around
        return `v2:${this.provider.name}:${wrapped}:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
    }
    /** Resolve a v2 (envelope) or legacy v1 (direct-AES) token ref. */
    async resolve(tokenRef) {
        if (tokenRef.startsWith('v2:')) {
            const [, providerName, wrapped, ivB64, tagB64, encB64] = tokenRef.split(':');
            const provider = providerName === this.provider.name ? this.provider
                : providerName === 'local' ? this.local
                    : this.provider; // kms tokens always go to the kms provider
            const dek = await provider.unwrapDataKey(wrapped);
            const d = (0, crypto_1.createDecipheriv)('aes-256-gcm', dek, Buffer.from(ivB64, 'base64'));
            d.setAuthTag(Buffer.from(tagB64, 'base64'));
            const out = Buffer.concat([d.update(Buffer.from(encB64, 'base64')), d.final()]).toString('utf8');
            dek.fill(0);
            return out;
        }
        // Legacy v1: direct AES-256-GCM under the local master key.
        const [, ivB64, tagB64, encB64] = tokenRef.split(':');
        const d = (0, crypto_1.createDecipheriv)('aes-256-gcm', this.legacyKey, Buffer.from(ivB64, 'base64'));
        d.setAuthTag(Buffer.from(tagB64, 'base64'));
        return Buffer.concat([d.update(Buffer.from(encB64, 'base64')), d.final()]).toString('utf8');
    }
    /**
     * Deterministic, non-reversible keyed hash — for UNIQUENESS / matching (e.g. PAN),
     * where tokenize() can't be used because it randomises the IV. HMAC-SHA256 hex.
     */
    hash(plaintext) {
        return (0, crypto_1.createHmac)('sha256', this.legacyKey).update(plaintext.trim().toUpperCase()).digest('hex');
    }
    /** masked display, e.g. PAN → ABCxxxx1F */
    mask(plaintext) {
        if (plaintext.length <= 4)
            return '****';
        return plaintext.slice(0, 3) + '****' + plaintext.slice(-2);
    }
};
exports.PiiVaultService = PiiVaultService;
exports.PiiVaultService = PiiVaultService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PiiVaultService);
