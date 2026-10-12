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
  canPair: users.canPair,
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

/** Postgres' unique-violation code, on the error or (drizzle wraps it) its cause. */
function isUniqueViolation(error: unknown): boolean {
  const codeOf = (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined;
  const cause = error instanceof Error ? error.cause : undefined;
  return codeOf(error) === '23505' || codeOf(cause) === '23505';
}

/**
 * The user for an Access email (their username), created on first sight with `role`. They have
 * no password: the stored hash never matches one.
 */
export async function findOrCreateAccessUser(db: Db, email: string, role: UserRole): Promise<User> {
  const found = await findLoginUser(db, email);
  if (found !== null) return { ...found, role: found.role };
  // Someone new waits for an admin to approve them (enable the account); admins don't.
  const created = await insertUser(db, {
    username: email,
    passwordHash: '!',
    role,
    mustChangePassword: false,
    disabled: role !== 'admin',
  });
  if (created !== null) return created;
  // Another request created them first.
  const raced = await findLoginUser(db, email);
  if (raced === null) throw new Error('Access user could not be created');
  return raced;
}

/** Adds a user; null when the username is taken (checked by the database, so races lose too). */
export async function insertUser(
  db: Db,
  values: {
    username: string;
    passwordHash: string;
    role: UserRole;
    mustChangePassword: boolean;
    disabled?: boolean;
  },
): Promise<User | null> {
  try {
    const [row] = await db.insert(users).values(values).returning(userColumns);
    if (row === undefined) throw new Error('Insert returned no user');
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/**
 * Runs `work` with every enabled admin row locked, so checks like "another admin remains" and
 * the change they guard can't interleave with another request's.
 */
export async function withAdminsLocked<T>(db: Db, work: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select ${users.id} from ${users} where ${users.role} = 'admin' and not ${users.disabled} for update`,
    );
    return work(tx);
  });
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
