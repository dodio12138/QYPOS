import crypto from "node:crypto";

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = "sha512";
const HASH_PREFIX = "pbkdf2";

/**
 * Hash a plain-text PIN using PBKDF2.
 * Format: pbkdf2:<iterations>:<salt_hex>:<hash_hex>
 */
export function hashPin(plain) {
  const salt = crypto.randomBytes(32);
  const hash = crypto.pbkdf2Sync(plain, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  return `${HASH_PREFIX}:${PBKDF2_ITERATIONS}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * Verify a plain-text PIN against stored value (hash or legacy plaintext).
 * Returns { valid, upgraded } where upgraded is the new hash if migration occurred.
 */
export function verifyPin(plain, stored) {
  if (!stored) return { valid: false, upgraded: null };
  // New-style hash
  if (stored.startsWith(`${HASH_PREFIX}:`)) {
    const parts = stored.split(":");
    if (parts.length < 4) return { valid: false, upgraded: null };
    const iterations = parseInt(parts[1], 10);
    if (!iterations || iterations < 1) return { valid: false, upgraded: null };
    let salt, expected;
    try {
      salt = Buffer.from(parts[2], "hex");
      expected = Buffer.from(parts[3], "hex");
    } catch {
      return { valid: false, upgraded: null };
    }
    if (salt.length === 0 || expected.length === 0) return { valid: false, upgraded: null };
    let actual;
    try {
      actual = crypto.pbkdf2Sync(plain, salt, iterations, PBKDF2_KEYLEN, PBKDF2_DIGEST);
    } catch {
      return { valid: false, upgraded: null };
    }
    // timingSafeEqual throws if buffers differ in length — treat as mismatch
    let valid;
    try {
      valid = crypto.timingSafeEqual(actual, expected);
    } catch {
      valid = false;
    }
    return { valid, upgraded: null };
  }
  // Legacy plaintext PIN — verify and auto-upgrade
  if (stored === plain) {
    return { valid: true, upgraded: hashPin(plain) };
  }
  return { valid: false, upgraded: null };
}

export function normalizePermissions(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export async function userFromToken(request, redis) {
  const header = request.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : request.query?.token ?? null;
  if (!token) return null;
  const payload = await redis.get(`session:${token}`);
  if (!payload) return null;
  const user = JSON.parse(payload);
  user.permissions = normalizePermissions(user.permissions);
  return user;
}

export async function requirePermission(request, reply, redis, permission) {
  const user = await userFromToken(request, redis);
  if (!user) {
    reply.code(401);
    return null;
  }
  if (permission && !user.permissions.includes(permission)) {
    reply.code(403);
    return null;
  }
  return user;
}
