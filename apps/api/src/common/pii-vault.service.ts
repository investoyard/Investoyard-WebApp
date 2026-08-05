import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Load the vault master-key material.
 *   PRIMARY  — from a dedicated key file (PII_VAULT_KEY_FILE, default <cwd>/.pii-vault.key).
 *              Minted as a strong random key on first run so the secret lives in its own
 *              ACL-locked, git-ignored file rather than an env var / config.
 *   FALLBACK — the previous PII_VAULT_KEY env (+ legacy dev default) are still tried on
 *              DECRYPT, so anything encrypted under the old key keeps resolving. New writes
 *              always use the PRIMARY key.
 *
 * ⚠️ BACK UP THE KEY FILE. If it is lost, data encrypted under it is unrecoverable.
 */
function loadVaultKeys(log: Logger): { primary: string; fallbacks: string[] } {
  const file = process.env.PII_VAULT_KEY_FILE || join(process.cwd(), '.pii-vault.key');
  const envKey = process.env.PII_VAULT_KEY;
  let primary: string;
  if (existsSync(file)) {
    primary = readFileSync(file, 'utf8').trim();
  } else {
    primary = randomBytes(48).toString('base64'); // strong, random
    try {
      writeFileSync(file, primary, { encoding: 'utf8', mode: 0o600 });
      log.log(`PII vault key file created → ${file} (BACK IT UP; ACL it to the app-pool user)`);
    } catch (e: any) {
      log.warn(`could not write key file ${file} (${e.message}) — falling back to PII_VAULT_KEY env`);
      primary = envKey || 'dev-only-key';
    }
  }
  const fallbacks = [envKey, 'dev-only-key'].filter((k): k is string => !!k && k !== primary);
  return { primary, fallbacks };
}

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

/**
 * Local: DEK wrapped with an AES-256-GCM master key from the key file.
 * `masters[0]` is the primary (used to wrap); the rest are prior keys tried on unwrap.
 */
class LocalKeyProvider implements KeyProvider {
  readonly name = 'local';
  constructor(private readonly masters: Buffer[]) {}

  async generateDataKey() {
    const plaintextKey = randomBytes(32);
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.masters[0], iv);
    const enc = Buffer.concat([c.update(plaintextKey), c.final()]);
    const wrapped = Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
    return { plaintextKey, wrapped };
  }

  async unwrapDataKey(wrapped: string) {
    const buf = Buffer.from(wrapped, 'base64');
    const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
    let lastErr: unknown;
    for (const master of this.masters) {
      try {
        const d = createDecipheriv('aes-256-gcm', master, iv);
        d.setAuthTag(tag);
        return Buffer.concat([d.update(enc), d.final()]);
      } catch (e) { lastErr = e; } // wrong key → GCM auth fails; try the next (fallback) key
    }
    throw lastErr ?? new Error('unwrap failed');
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
  private readonly local: LocalKeyProvider; // always available for v1 + local v2 tokens
  /** master keys, primary first — [0] wraps/hashes, the rest are decrypt-only fallbacks */
  private readonly masters: Buffer[];

  constructor() {
    const { primary, fallbacks } = loadVaultKeys(this.log);
    this.masters = [primary, ...fallbacks].map((k) => createHash('sha256').update(k).digest());
    this.local = new LocalKeyProvider(this.masters);
    this.provider = process.env.KMS_KEY_ID ? new AwsKmsProvider(process.env.KMS_KEY_ID) : this.local;
    this.log.log(
      `PII vault provider: ${this.provider.name}` +
        (this.provider.name === 'local' ? ` (key file; ${fallbacks.length} fallback key(s) for decrypt)` : ''),
    );
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
    // Legacy v1: direct AES-256-GCM under a master key — try primary then fallbacks.
    const [, ivB64, tagB64, encB64] = tokenRef.split(':');
    const iv = Buffer.from(ivB64, 'base64'), tag = Buffer.from(tagB64, 'base64'), enc = Buffer.from(encB64, 'base64');
    let lastErr: unknown;
    for (const master of this.masters) {
      try {
        const d = createDecipheriv('aes-256-gcm', master, iv);
        d.setAuthTag(tag);
        return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
      } catch (e) { lastErr = e; }
    }
    throw lastErr ?? new Error('legacy resolve failed');
  }

  /**
   * Deterministic, non-reversible keyed hash — for UNIQUENESS / matching (e.g. PAN),
   * where tokenize() can't be used because it randomises the IV. HMAC-SHA256 hex.
   */
  hash(plaintext: string): string {
    return createHmac('sha256', this.masters[0]).update(plaintext.trim().toUpperCase()).digest('hex');
  }

  /** masked display, e.g. PAN → ABCxxxx1F */
  mask(plaintext: string): string {
    if (plaintext.length <= 4) return '****';
    return plaintext.slice(0, 3) + '****' + plaintext.slice(-2);
  }
}
