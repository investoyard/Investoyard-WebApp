/**
 * BSE iBBS request Checksum — ported verbatim from sir's C# reference on
 * 2026-09-10 (member 133 iBBS live), which is what the live iBBS service
 * actually accepts. The earlier implementation (AES-GCM keyed by a
 * per-member Base64 key) was written from the docs' abstract description
 * of "AES-256" and produced a checksum the service rejects.
 *
 * The recipe:
 *
 *   1. digest = SHA256(payload)                          → 32-byte hash
 *   2. hexUpper = digest formatted as UPPERCASE hex      → 64-char string
 *   3. bytesToEncrypt = UTF-8 bytes of hexUpper          → 64 bytes
 *   4. password = SHA256("IBBS")                         → 32 bytes  ← hardcoded per BSE
 *   5. Rfc2898DeriveBytes(password, salt={1..8}, iter=1000) via PBKDF2-SHA1:
 *        AES key = first 32 bytes of the derived stream
 *        AES IV  = next  16 bytes of the derived stream
 *   6. AES-256-CBC, PKCS7 padding, encrypt bytesToEncrypt
 *   7. base64(ciphertext)                                → the Checksum header
 *
 * The stored `checksumKeyBase64` field on the credential is IGNORED for
 * live — BSE derives from the hardcoded "IBBS" string, not a per-member
 * key. Kept in the signature so future variants can plug in without a
 * caller change; passing "" uses the live default.
 */
import { createHash, createCipheriv, pbkdf2Sync } from 'crypto';

/** Node port of the C# EncryptText(pInput, password="IBBS"). */
export function bseChecksum(payload: string, _checksumKeyBase64?: string): string {
  const password = _checksumKeyBase64 && _checksumKeyBase64.trim().length
    // Reserved for future per-member keys — currently unused.
    ? Buffer.from(_checksumKeyBase64, 'utf8')
    : Buffer.from('IBBS', 'utf8');
  const passwordSha = createHash('sha256').update(password).digest();               // 32 bytes
  const hexUpper = createHash('sha256').update(payload, 'utf8').digest('hex').toUpperCase();
  const bytesToEncrypt = Buffer.from(hexUpper, 'utf8');                             // 64 bytes
  const salt = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  // Rfc2898DeriveBytes is PBKDF2-SHA1 with the default C# implementation
  // through .NET 4.7.x; we match that explicitly. 32 + 16 = 48 derived bytes.
  const derived = pbkdf2Sync(passwordSha, salt, 1000, 48, 'sha1');
  const key = derived.subarray(0, 32);
  const iv = derived.subarray(32, 48);
  const cipher = createCipheriv('aes-256-cbc', key, iv);  // PKCS7 padding is Node's default for CBC
  const ct = Buffer.concat([cipher.update(bytesToEncrypt), cipher.final()]);
  return ct.toString('base64');
}
