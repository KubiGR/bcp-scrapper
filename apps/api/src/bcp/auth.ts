import { createHash } from 'node:crypto';
import type { BcpStatus } from '@bcp/shared';
import { z } from 'zod';
import { BcpAuthError, BcpUnavailableError } from '../errors';
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
  /** sha256 of the .env tokens this session was seeded from, so a changed .env token takes over. */
  seedTokenHash: string | null;
}

export interface BcpSessionStore {
  load(): Promise<BcpSession | null>;
  save(session: BcpSession): Promise<void>;
}

export type BcpAuthState = Exclude<BcpStatus['state'], 'fixtures'>;

export interface BcpAuthStatus {
  state: BcpAuthState;
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

const LOG_IN_AGAIN = 'Log in to bestcoastpairings.com again and update BCP_REFRESH_TOKEN.';

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

/** Fingerprint of both .env tokens, or null when neither is set. */
function seedHashOf(refreshToken: string | undefined, accessToken: string | undefined) {
  if (!refreshToken && !accessToken) return null;
  return sha256(`${refreshToken ?? ''}\n${accessToken ?? ''}`);
}

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
  /** The refresh token BCP last refused. It is never sent again; a different token clears this. */
  #rejectedRefreshToken: string | null = null;

  constructor(options: BcpAuthOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? Date.now;
  }

  async getAccessToken(): Promise<string | null> {
    const session = await this.#loadSession();
    if (this.#needsRefresh(session)) await this.refresh();
    return this.#session?.accessToken ?? null;
  }

  refresh(): Promise<void> {
    this.#refreshing ??= this.#doRefresh().finally(() => {
      this.#refreshing = null;
    });
    return this.#refreshing;
  }

  /**
   * Where the login stands. A stale login is refreshed (single-flight) to find out;
   * a rejected one is reported as such rather than thrown.
   */
  async status(): Promise<BcpAuthStatus> {
    const state = await this.#checkLogin();
    const session = this.#session;
    return {
      state,
      accessTokenExpiresAt: session?.accessTokenExpiresAt?.toISOString() ?? null,
      lastRefreshAt: session?.lastRefreshAt?.toISOString() ?? null,
    };
  }

  async #checkLogin(): Promise<BcpAuthState> {
    const session = await this.#loadSession();
    if (!this.#needsRefresh(session)) return this.#isUsable(session) ? 'connected' : 'missing';
    try {
      await this.refresh();
      return 'connected';
    } catch (error) {
      if (error instanceof BcpAuthError) return 'rejected';
      throw error;
    }
  }

  async #loadSession(): Promise<BcpSession> {
    if (this.#session) return this.#session;

    const { envRefreshToken, envAccessToken, store } = this.#options;
    const seedHash = seedHashOf(envRefreshToken, envAccessToken);
    const stored = await store.load();
    // A stored session wins (it may hold a rotated refresh token), unless the user has since
    // changed a token in .env, e.g. after logging in again or pasting a fallback access token.
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

  #isRejected(session: BcpSession): boolean {
    return session.refreshToken !== null && session.refreshToken === this.#rejectedRefreshToken;
  }

  /** A rejected login counts too, so it fails fast (without a POST) instead of using a dead token. */
  #needsRefresh(session: BcpSession): boolean {
    return (
      session.refreshToken !== null && (this.#isExpiring(session) || this.#isRejected(session))
    );
  }

  #isUsable(session: BcpSession): boolean {
    return session.accessToken !== null && !this.#isExpired(session);
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
    if (this.#isRejected(session)) {
      throw new BcpAuthError(`BCP already rejected this refresh token. ${LOG_IN_AGAIN}`);
    }

    // Unlike the data endpoints, BCP's token endpoint has no /v1 prefix.
    const response = await this.#fetch(new URL('/oauth/token', this.#options.apiUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'client-id': 'web-app' },
      body: JSON.stringify({ refresh_token: session.refreshToken, grant_type: 'refresh_token' }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
    if (response.status === 429 || response.status >= 500) {
      // BCP is struggling; the token may be fine, so it is neither remembered nor reported as rejected.
      throw new BcpUnavailableError(`BCP could not refresh the login (HTTP ${response.status})`);
    }
    if (!response.ok) {
      this.#rejectedRefreshToken = session.refreshToken;
      throw new BcpAuthError(
        `BCP rejected the refresh token (HTTP ${response.status}). ${LOG_IN_AGAIN}`,
      );
    }
    const parsed = RefreshResponseSchema.safeParse(await response.json().catch(() => null));
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
