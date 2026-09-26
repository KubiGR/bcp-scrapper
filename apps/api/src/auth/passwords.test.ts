import { describe, expect, it } from 'vitest';
import { DUMMY_HASH, generateTemporaryPassword, hashPassword, verifyPassword } from './passwords';

describe('hashPassword / verifyPassword', () => {
  it('stores scrypt with explicit parameters and verifies the same password', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(stored).not.toContain('correct horse');
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse batterz', stored)).toBe(false);
  });

  it('salts every hash, so the same password hashes differently', async () => {
    expect(await hashPassword('same password!!')).not.toBe(await hashPassword('same password!!'));
  });

  it('treats a malformed stored hash as a mismatch instead of throwing', async () => {
    for (const stored of [
      '',
      'plain',
      'scrypt$1$8$1$abc$def',
      'bcrypt$16384$8$1$a$b',
      'scrypt$16384$8$1$$',
    ]) {
      expect(await verifyPassword('anything at all', stored), stored).toBe(false);
    }
  });

  it('has a dummy hash that is well-formed but matches nothing typed', async () => {
    expect(DUMMY_HASH).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword('', DUMMY_HASH)).toBe(false);
    expect(await verifyPassword('password1234', DUMMY_HASH)).toBe(false);
  });

  it('generates temporary passwords long enough to pass the 12-character rule', () => {
    const a = generateTemporaryPassword();
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(a).not.toBe(generateTemporaryPassword());
  });
});
