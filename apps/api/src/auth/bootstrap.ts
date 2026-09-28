import { PASSWORD_MIN_LENGTH, UsernameSchema } from '@bcp/shared';
import type { Config } from '../config';
import type { Db } from '../db/client';
import type { Logger } from '../logger';
import { countUsers, insertUser } from '../repo/users';
import { hashPassword } from './passwords';

/** Creates the first admin from ADMIN_USERNAME / ADMIN_PASSWORD while there are no users yet. */
export async function ensureAdmin(db: Db, config: Config, logger: Logger): Promise<void> {
  if ((await countUsers(db)) > 0) return;
  const { ADMIN_USERNAME: username, ADMIN_PASSWORD: password } = config;
  if (username === undefined || password === undefined) {
    if (config.AUTH_REQUIRED) {
      logger.warn('No users yet: set ADMIN_USERNAME and ADMIN_PASSWORD to create the first admin');
    }
    return;
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  const user = await insertUser(db, {
    username: UsernameSchema.parse(username),
    passwordHash: await hashPassword(password),
    role: 'admin',
    mustChangePassword: false,
  });
  // Taken: another process created it first; nothing to do.
  if (user === null) return;
  logger.info({ username: user.username }, 'Admin created — remove ADMIN_PASSWORD from the stack');
}
