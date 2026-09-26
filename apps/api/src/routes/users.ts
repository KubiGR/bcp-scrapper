import {
  CreateUserRequestSchema,
  UpdateUserRequestSchema,
  type CreateUserResponse,
  type ResetPasswordResponse,
  type UsersResponse,
} from '@bcp/shared';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import type { AuthEnv } from '../auth/middleware';
import { generateTemporaryPassword, hashPassword } from '../auth/passwords';
import { deleteUserSessions } from '../auth/sessions';
import type { Db } from '../db/client';
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../errors';
import {
  countOtherActiveAdmins,
  deleteUser,
  findUserById,
  insertUser,
  listUsers,
  updateUser,
  usernameTaken,
} from '../repo/users';
import { parseInput } from '../validation';
import { requireJson } from './require-json';

const IdSchema = z.coerce.number().int().positive();

const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const user = c.get('user');
  if (user === undefined) throw new UnauthorizedError();
  if (user.role !== 'admin') throw new ForbiddenError('Admins only');
  await next();
});

function refuse(message: string): never {
  throw new ValidationError([{ path: 'id', message }], message);
}

/** Admin-only user management (mounted only when logins are on). */
export function userRoutes(deps: { db: Db }) {
  const { db } = deps;
  const app = new Hono<AuthEnv>();
  app.use('/users', requireAdmin);
  app.use('/users/*', requireAdmin);

  async function target(idText: string) {
    const user = await findUserById(db, parseInput(IdSchema, idText));
    if (user === null) throw new NotFoundError('No such user');
    return user;
  }

  /** Refuses changes that would leave no enabled admin. */
  async function keepAnAdmin(userId: number): Promise<void> {
    if ((await countOtherActiveAdmins(db, userId)) === 0)
      refuse('The app needs at least one admin');
  }

  app.get('/users', async (c) => {
    const body: UsersResponse = { users: await listUsers(db) };
    return c.json(body);
  });

  app.post('/users', requireJson, async (c) => {
    const { username, role } = parseInput(
      CreateUserRequestSchema,
      await c.req.json<unknown>().catch(() => null),
    );
    if (await usernameTaken(db, username)) {
      throw new ValidationError([{ path: 'username', message: 'Taken' }], 'That username is taken');
    }
    const temporaryPassword = generateTemporaryPassword();
    const user = await insertUser(db, {
      username,
      role,
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
    });
    const body: CreateUserResponse = { user, temporaryPassword };
    return c.json(body);
  });

  app.post('/users/:id/reset-password', async (c) => {
    const user = await target(c.req.param('id'));
    if (user.id === c.get('user')?.id) refuse('Use Change password for your own account');
    const temporaryPassword = generateTemporaryPassword();
    await updateUser(db, user.id, {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
    });
    await deleteUserSessions(db, user.id);
    const body: ResetPasswordResponse = { temporaryPassword };
    return c.json(body);
  });

  app.patch('/users/:id', requireJson, async (c) => {
    const user = await target(c.req.param('id'));
    const change = parseInput(
      UpdateUserRequestSchema,
      await c.req.json<unknown>().catch(() => null),
    );
    const self = user.id === c.get('user')?.id;
    if (self && change.disabled === true) refuse('You can’t disable yourself');
    if (self && change.role === 'member') refuse('You can’t demote yourself');
    const losesAdmin =
      user.role === 'admin' &&
      !user.disabled &&
      (change.role === 'member' || change.disabled === true);
    if (losesAdmin) await keepAnAdmin(user.id);
    const updated = await updateUser(db, user.id, change);
    if (change.disabled === true) await deleteUserSessions(db, user.id);
    return c.json({ user: updated });
  });

  app.delete('/users/:id', async (c) => {
    const user = await target(c.req.param('id'));
    if (user.id === c.get('user')?.id) refuse('You can’t remove yourself');
    if (user.role === 'admin' && !user.disabled) await keepAnAdmin(user.id);
    // Sessions go with the user (on delete cascade).
    await deleteUser(db, user.id);
    return c.json({ ok: true });
  });

  return app;
}
