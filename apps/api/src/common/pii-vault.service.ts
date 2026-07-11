import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac } from 'crypto';

/**
 * PiiVaultService — tokenize/resolve sensitive fields (PAN, bank, UPI, rail secrets)
 * using ENVELOPE ENCRYPTION:
 *
 *   plaintext --AES-256-GCM--> ciphertext, under a fresh random DATA KEY (DEK);
 *   the DEK itself is wrapped by the master-key PROVIDER and stored alongside.
 *
 * Providers (selected at boot):
 *   - AwsKmsProvider   — when KMS_KEY_ID is set: the DEK is generated/unwrapped by
 *                        AWS KMS (GenerateDataKey / Decrypt); the master key never
 *                        leaves KMS. Needs @aws-sdk/client-kms + AWS creds.
 *   - LocalKeyProvider — dev fallback: the DEK is wrapped with a local AES master
 *                        key derived from PII_VAULT_KEY.
 *
 * Token formats:
 *   v2:<provider>:<wrappedDek>:<iv>:<tag>:<ciphertext>   (envelope — current)
 *   v1:<iv>:<tag>:<ciphertext>                           (legacy direct-AES — still resolvable)
 *
 * The raw value is resolved only at rail-call time and never logged.
 */

interface KeyProvider {
  readonly name: string;
  generateDataKey(): Promise<{ plaintextKey: Buffer; wrapped: string }>;
  unwrapDataKey(wrapped: string): Promise<Buffer>;
}

/** Dev: DEK wrapped with a local AES-256-GCM master key from PII_VAULT_KEY. */
class LocalKeyProvider implements KeyProvider {
  readonly name = 'local';
  private master = createHash('sha256').update(process.env.PII_VAULT_KEY ?? 'dev-only-key').digest();

  async generateDataKey() {
    const plaintextKey = randomBytes(32);
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.master, iv);
    const enc = Buffer.concat([c.update(plaintextKey), c.final()]);
    const wrapped = Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
    return { plaintextKey, wrapped };
  }

  async unwrapDataKey(wrapped: string) {
    const buf = Buffer.from(wrapped, 'base64');
    const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
    const d = createDecipheriv('aes-256-gcm', this.master, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]);
  }
}

/** Prod: DEK generated/unwrapped by AWS KMS — the master key never leaves KMS. */
class AwsKmsProvider implements KeyProvider {
  readonly name = 'kms';
  private client: any;
  private sdk: any;
  constructor(private keyId: string) {}

  /** Load the SDK at runtime (prod-only dep — `npm i @aws-sdk/client-kms` + AWS creds/role). */
  private async load() {
    if (!this.sdk) {
      const modName = '@aws-sdk/client-kms'; // variable specifier: no compile-time resolution
      this.sdk = await import(modName);
      this.client = new this.sdk.KMSClient({});
    }
    return this.sdk;
  }

  async generateDataKey() {
    const sdk = await this.load();
    const res = await this.client.send(new sdk.GenerateDataKeyCommand({ KeyId: this.keyId, KeySpec: 'AES_256' }));
    return { plaintextKey: Buffer.from(res.Plaintext), wrapped: Buffer.from(res.CiphertextBlob).toString('base64') };
  }

  async unwrapDataKey(wrapped: string) {
    const sdk = await this.load();
    const res = await this.client.send(new sdk.DecryptCommand({ CiphertextBlob: Buffer.from(wrapped, 'base64') }));
    return Buffer.from(res.Plaintext);
  }
}

@Injectable()
export class PiiVaultService {
  private readonly log = new Logger('Vault');
  private readonly provider: KeyProvider;
  private readonly local = new LocalKeyProvider(); // always available for v1 + local v2 tokens
  private legacyKey = createHash('sha256').update(process.env.PII_VAULT_KEY ?? 'dev-only-key').digest();

  constructor() {
    this.provider = process.env.KMS_KEY_ID ? new AwsKmsProvider(process.env.KMS_KEY_ID) : this.local;
    this.log.log(`PII vault provider: ${this.provider.name}${this.provider.name === 'local' ? ' (dev — set KMS_KEY_ID for AWS KMS)' : ''}`);
  }

  /** Envelope-encrypt a value → opaque v2 token ref. */
  async tokenize(plaintext: string): Promise<string> {
    const { plaintextKey, wrapped } = await this.provider.generateDataKey();
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', plaintextKey, iv);
    const enc = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
    plaintextKey.fill(0); // don't keep the DEK around
    return `v2:${this.provider.name}:${wrapped}:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
  }

  /** Resolve a v2 (envelope) or legacy v1 (direct-AES) token ref. */
  async resolve(tokenRef: string): Promise<string> {
    if (tokenRef.startsWith('v2:')) {
      const [, providerName, wrapped, ivB64, tagB64, encB64] = tokenRef.split(':');
      const provider = providerName === this.provider.name ? this.provider
        : providerName === 'local' ? this.local
        : this.provider; // kms tokens always go to the kms provider
      const dek = await provider.unwrapDataKey(wrapped);
      const d = createDecipheriv('aes-256-gcm', dek, Buffer.from(ivB64, 'base64'));
      d.setAuthTag(Buffer.from(tagB64, 'base64'));
      const out = Buffer.concat([d.update(Buffer.from(encB64, 'base64')), d.final()]).toString('utf8');
      dek.fill(0);
      return out;
    }
    // Legacy v1: direct AES-256-GCM under the local master key.
    const [, ivB64, tagB64, encB64] = tokenRef.split(':');
    const d = createDecipheriv('aes-256-gcm', this.legacyKey, Buffer.from(ivB64, 'base64'));
    d.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([d.update(Buffer.from(encB64, 'base64')), d.final()]).toString('utf8');
  }

  /**
   * Deterministic, non-reversible keyed hash — for UNIQUENESS / matching (e.g. PAN),
   * where tokenize() can't be used because it randomises the IV. HMAC-SHA256 hex.
   */
  hash(plaintext: string): string {
    return createHmac('sha256', this.legacyKey).update(plaintext.trim().toUpperCase()).digest('hex');
  }

  /** masked display, e.g. PAN → ABCxxxx1F */
  mask(plaintext: string): string {
    if (plaintext.length <= 4) return '****';
    return plaintext.slice(0, 3) + '****' + plaintext.slice(-2);
  }
}
