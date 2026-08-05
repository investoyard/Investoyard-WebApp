/**
 * BSE iBBS request Checksum (shared by the bidding + message APIs).
 *
 * Per the v1.05.5 / v1.03.5 docs (Basic Security "v1"):
 *   Checksum = base64( AES-256-GCM( SHA256(payload) ) )
 *   payload  = JSON body (POST)  |  Membercode+Login+Token (GET)
 * keyed by the AES-256 key BSE provisions per member (base64).
 *
 * ⚠️ The docs specify the ALGORITHM but not the exact GCM nonce/output framing.
 * This implementation uses a random 12-byte nonce and emits base64(iv | ct | tag).
 * CONFIRM against BSE's reference sample on UAT before enabling BSE calls
 * (the adapters stay gated until then).
 */
import { createHash, createCipheriv, randomBytes } from 'crypto';

export function bseChecksum(payload: string, checksumKeyBase64: string): string {
  const key = Buffer.from(checksumKeyBase64, 'base64'); // 32-byte AES-256 key
  const digest = createHash('sha256').update(payload, 'utf8').digest(); // 32 bytes
  const iv = randomBytes(12); // GCM nonce
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(digest), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString('base64');
}
