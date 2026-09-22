import { createHash } from 'node:crypto';
import { z } from 'zod';
import { BcpAuthError } from '../errors';
import type { Logger } from '../logger';
import type { AccessTokenProvider } from './transport';

/** Refresh this long before the access token actually expires. */
const EXPIRY_MARGIN_MS = 60_000;
const REFRESH_TIMEOUT_MS = 15_000;

export interface BcpSession {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  lastRefreshAt: Date | null;
  /** sha256 of the BCP_REFRESH_TOKEN this session was seeded from, so a new .env token takes over. */
  seedTokenHash: string | null;
}

export interface BcpSessionStore {
  load(): Promise<BcpSession | null>;
  save(session: BcpSession): Promise<void>;
}

export interface BcpAuthStatus {
  authenticated: boolean;
  accessTokenExpiresAt: string | null;
  lastRefreshAt: string | null;
}

export interface BcpAuthOptions {
  apiUrl: string;
  store: BcpSessionStore;
  envRefreshToken?: string | undefined;
  envAccessToken?: string | undefined;
  logger: Logger;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}

const RefreshResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).nullish(),
});

const JwtPayloadSchema = z.object({ exp: z.number() });

export function decodeJwtExpiry(token: string): Date | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const parsed = JwtPayloadSchema.safeParse(
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    );
    return parsed.success ? new Date(parsed.data.exp * 1000) : null;
  } catch {
    return null;
  }
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function createMemorySessionStore(initial: BcpSession | null = null): BcpSessionStore {
  let session = initial;
  return {
    load: () => Promise.resolve(session),
    save: (next) => {
      session = next;
      return Promise.resolve();
    },
  };
}

/** Keeps a valid BCP access token around, refreshing it with the user's refresh token. */
export class BcpAuth implements AccessTokenProvider {
  readonly #options: BcpAuthOptions;
  readonly #fetch: typeof globalThis.fetch;
  readonly #now: () => number;
  #session: BcpSession | null = null;
  #refreshing: Promise<void> | null = null;

  constructor(options: BcpAuthOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? Date.now;
  }

  async getAccessToken(): Promise<string | null> {
    const session = await this.#loadSession();
    if (session.refreshToken && this.#isExpiring(session)) await this.refresh();
    return this.#session?.accessToken ?? null;
  }

  refresh(): Promise<void> {
    this.#refreshing ??= this.#doRefresh().finally(() => {
      this.#refreshing = null;
    });
    return this.#refreshing;
  }

  async status(): Promise<BcpAuthStatus> {
    const session = await this.#loadSession();
    return {
      authenticated: session.accessToken !== null && !this.#isExpired(session),
      accessTokenExpiresAt: session.accessTokenExpiresAt?.toISOString() ?? null,
      lastRefreshAt: session.lastRefreshAt?.toISOString() ?? null,
    };
  }

  async #loadSession(): Promise<BcpSession> {
    if (this.#session) return this.#session;

    const { envRefreshToken, envAccessToken, store } = this.#options;
    const seedHash = envRefreshToken ? sha256(envRefreshToken) : null;
    const stored = await store.load();
    // A stored session wins (it may hold a rotated refresh token), unless the user has
    // since put a different refresh token into .env, e.g. after logging in again.
    if (stored && (seedHash === null || stored.seedTokenHash === seedHash)) {
      this.#session = stored;
      return stored;
    }

    const seeded: BcpSession = {
      accessToken: envAccessToken ?? null,
      refreshToken: envRefreshToken ?? null,
      accessTokenExpiresAt: envAccessToken ? decodeJwtExpiry(envAccessToken) : null,
      lastRefreshAt: null,
      seedTokenHash: seedHash,
    };
    await store.save(seeded);
    this.#session = seeded;
    return seeded;
  }

  #isExpired(session: BcpSession): boolean {
    return (
      session.accessTokenExpiresAt !== null && session.accessTokenExpiresAt.getTime() <= this.#now()
    );
  }

  #isExpiring(session: BcpSession): boolean {
    if (session.accessToken === null) return true;
    if (session.accessTokenExpiresAt === null) return false;
    return session.accessTokenExpiresAt.getTime() - this.#now() < EXPIRY_MARGIN_MS;
  }

  async #doRefresh(): Promise<void> {
    const session = await this.#loadSession();
    if (!session.refreshToken) {
      throw new BcpAuthError('No BCP refresh token configured. Set BCP_REFRESH_TOKEN in .env.');
    }

    const response = await this.#fetch(new URL('/v1/oauth/token', this.#options.apiUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'client-id': 'web-app' },
      body: JSON.stringify({ refresh_token: session.refreshToken, grant_type: 'refresh_token' }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new BcpAuthError(
        `BCP rejected the refresh token (HTTP ${response.status}). Log in to bestcoastpairings.com again and update BCP_REFRESH_TOKEN.`,
      );
    }
    const parsed = RefreshResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new BcpAuthError('BCP token response had an unexpected shape');

    const next: BcpSession = {
      ...session,
      accessToken: parsed.data.accessToken,
      refreshToken: parsed.data.refreshToken ?? session.refreshToken,
      accessTokenExpiresAt: decodeJwtExpiry(parsed.data.accessToken),
      lastRefreshAt: new Date(this.#now()),
    };
    await this.#options.store.save(next);
    this.#session = next;
    this.#options.logger.info(
      {
        expiresAt: next.accessTokenExpiresAt?.toISOString(),
        rotated: Boolean(parsed.data.refreshToken),
      },
      'Refreshed BCP access token',
    );
  }
}
