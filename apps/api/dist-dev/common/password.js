"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const crypto_1 = require("crypto");
const util_1 = require("util");
/**
 * Operator password hashing using Node's built-in scrypt (no native module — safe
 * under iisnode). Format: `scrypt$<saltHex>$<hashHex>`.
 */
const scryptAsync = (0, util_1.promisify)(crypto_1.scrypt);
const KEYLEN = 64;
async function hashPassword(password) {
    const salt = (0, crypto_1.randomBytes)(16).toString('hex');
    const dk = (await scryptAsync(password, salt, KEYLEN));
    return `scrypt$${salt}$${dk.toString('hex')}`;
}
async function verifyPassword(password, stored) {
    if (!stored)
        return false;
    const [scheme, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !hash)
        return false;
    const dk = (await scryptAsync(password, salt, KEYLEN));
    const hb = Buffer.from(hash, 'hex');
    return dk.length === hb.length && (0, crypto_1.timingSafeEqual)(dk, hb);
}
