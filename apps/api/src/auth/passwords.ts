import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function derive(plain: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plain.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** `scrypt$N$r$p$<salt>$<hash>` (base64), with a fresh random salt. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(plain, salt, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/**
 * Whether `plain` matches a stored hash. Only our own parameters are accepted, so a tampered row
 * can't make verification cheap or exhaust memory; anything malformed is a mismatch.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltText, keyText] = parts;
  if (n !== String(N) || r !== String(R) || p !== String(P)) return false;
  const salt = Buffer.from(saltText ?? '', 'base64');
  const expected = Buffer.from(keyText ?? '', 'base64');
  if (salt.length !== SALT_BYTES || expected.length !== KEY_LENGTH) return false;
  const actual = await derive(plain, salt, { N, r: R, p: P });
  return timingSafeEqual(actual, expected);
}

/**
 * A valid hash of a random secret nobody knows: login checks unknown usernames against it, so they
 * cost the same scrypt run as a wrong password and timing reveals nothing.
 */
export const DUMMY_HASH = await hashPassword(randomBytes(32).toString('base64'));

/** A one-time password an admin hands out (16 URL-safe characters). */
export function generateTemporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}
