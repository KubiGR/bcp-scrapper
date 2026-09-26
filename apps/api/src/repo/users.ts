import type { User, UserRole } from '@bcp/shared';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { users } from '../db/schema';

/** The public view of a user: never the password hash. */
const userColumns = {
  id: users.id,
  username: users.username,
  role: users.role,
  mustChangePassword: users.mustChangePassword,
  disabled: users.disabled,
};

export async function listUsers(db: Db): Promise<User[]> {
  return db.select(userColumns).from(users).orderBy(asc(users.id));
}

export async function findUserById(db: Db, id: number): Promise<User | null> {
  const [row] = await db.select(userColumns).from(users).where(eq(users.id, id));
  return row ?? null;
}

/** For login: usernames match case-insensitively. */
export async function findLoginUser(
  db: Db,
  username: string,
): Promise<(User & { passwordHash: string }) | null> {
  const [row] = await db
    .select({ ...userColumns, passwordHash: users.passwordHash })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`);
  return row ?? null;
}

export async function passwordHashOf(db: Db, id: number): Promise<string | null> {
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, id));
  return row?.passwordHash ?? null;
}

export async function usernameTaken(db: Db, username: string): Promise<boolean> {
  return (await findLoginUser(db, username)) !== null;
}

export async function countUsers(db: Db): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  return row?.count ?? 0;
}

/** Enabled admins other than `exceptId`: the app must always keep one. */
export async function countOtherActiveAdmins(db: Db, exceptId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.disabled, false), ne(users.id, exceptId)));
  return row?.count ?? 0;
}

export async function insertUser(
  db: Db,
  values: { username: string; passwordHash: string; role: UserRole; mustChangePassword: boolean },
): Promise<User> {
  const [row] = await db.insert(users).values(values).returning(userColumns);
  if (row === undefined) throw new Error('Insert returned no user');
  return row;
}

export async function updateUser(
  db: Db,
  id: number,
  values: Partial<{
    passwordHash: string;
    role: UserRole;
    mustChangePassword: boolean;
    disabled: boolean;
  }>,
): Promise<User | null> {
  const [row] = await db.update(users).set(values).where(eq(users.id, id)).returning(userColumns);
  return row ?? null;
}

export async function deleteUser(db: Db, id: number): Promise<boolean> {
  const rows = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
  return rows.length > 0;
}
