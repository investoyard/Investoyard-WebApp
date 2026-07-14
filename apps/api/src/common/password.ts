import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

/**
 * Operator password hashing using Node's built-in scrypt (no native module — safe
 * under iisnode). Format: `scrypt$<saltHex>$<hashHex>`.
 */
const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const dk = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt}$${dk.toString('hex')}`;
}

export async function verifyPassword(password: string, stored?: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const dk = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  const hb = Buffer.from(hash, 'hex');
  return dk.length === hb.length && timingSafeEqual(dk, hb);
}
