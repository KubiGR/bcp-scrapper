import {
  ChangePasswordRequestSchema,
  LoginRequestSchema,
  type LoginResponse,
  type MeResponse,
} from '@bcp/shared';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { clientIp, SESSION_COOKIE, type AuthEnv, type AuthOptions } from '../auth/middleware';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../auth/passwords';
import type { LoginLimiter } from '../auth/rate-limit';
import {
  createSession,
  deleteSession,
  deleteUserSessions,
  SESSION_ABSOLUTE_MS,
} from '../auth/sessions';
import type { Db } from '../db/client';
import { LoginRateLimitedError, UnauthorizedError, ValidationError } from '../errors';
import { findLoginUser, passwordHashOf, updateUser } from '../repo/users';
import { parseInput } from '../validation';
import { requireJson } from './require-json';

const INVALID_LOGIN = 'Invalid username or password';

export interface LoginLimiters {
  /** Per username and address: guessing one account. */
  perUser: LoginLimiter;
  /** Per address: spraying many accounts. */
  perIp: LoginLimiter;
}

export function authRoutes(deps: {
  db: Db;
  options: AuthOptions;
  limiters: LoginLimiters;
  now: () => Date;
}) {
  const { db, options, limiters, now } = deps;
  const app = new Hono<AuthEnv>();

  app.get('/auth/me', (c) => {
    const user = c.get('user');
    const body: MeResponse = { authRequired: options.required, user: user ?? null };
    return c.json(body);
  });

  // Without logins (local development) there is nothing else here.
  if (!options.required) return app;

  app.post('/auth/login', requireJson, async (c) => {
    const { username, password } = parseInput(
      LoginRequestSchema,
      await c.req.json<unknown>().catch(() => null),
    );
    const ip = clientIp(c);
    const userKey = `${username.toLowerCase()}:${ip}`;
    const byUser = limiters.perUser.check(userKey);
    const byIp = limiters.perIp.check(ip);
    if (!byUser.allowed || !byIp.allowed) {
      throw new LoginRateLimitedError(Math.max(byUser.retryAfterSeconds, byIp.retryAfterSeconds));
    }

    // Count the attempt as failed before any await, so parallel guesses can't all get past the
    // check while the first ones are still being verified; a success takes it back below.
    limiters.perUser.fail(userKey);
    limiters.perIp.fail(ip);

    const user = await findLoginUser(db, username);
    // Unknown users are checked against a dummy hash, so both failures cost the same.
    const matches = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (user === null || !matches || user.disabled) throw new UnauthorizedError(INVALID_LOGIN);
    limiters.perUser.succeed(userKey);
    limiters.perIp.release(ip);

    const { token } = await createSession(db, options.secret, user.id, now());
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_ABSOLUTE_MS / 1000,
    });
    const body: LoginResponse = {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        disabled: user.disabled,
      },
    };
    return c.json(body);
  });

  app.post('/auth/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token !== undefined) await deleteSession(db, options.secret, token);
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
    return c.json({ ok: true });
  });

  app.post('/auth/password', requireJson, async (c) => {
    const user = c.get('user');
    if (user === undefined) throw new UnauthorizedError();
    const { current, next } = parseInput(
      ChangePasswordRequestSchema,
      await c.req.json<unknown>().catch(() => null),
    );
    const stored = await passwordHashOf(db, user.id);
    if (stored === null || !(await verifyPassword(current, stored))) {
      throw new ValidationError(
        [{ path: 'current', message: 'Wrong password' }],
        'Current password is wrong',
      );
    }
    if (next === current) {
      throw new ValidationError(
        [{ path: 'next', message: 'Choose a new password' }],
        'Choose a new password',
      );
    }
    await updateUser(db, user.id, {
      passwordHash: await hashPassword(next),
      mustChangePassword: false,
    });
    // Anyone else holding one of this user's sessions is logged out.
    await deleteUserSessions(db, user.id, c.get('sessionHash'));
    return c.json({ ok: true });
  });

  return app;
}
