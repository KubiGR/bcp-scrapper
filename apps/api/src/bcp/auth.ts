import { createHash } from 'node:crypto';
import type { BcpStatus } from '@bcp/shared';
import { z } from 'zod';
import { BcpAuthError, BcpRateLimitedError, BcpUnavailableError } from '../errors';
import { sleep } from '../lib/sleep';
import type { Logger } from '../logger';
import { parseRetryAfterSeconds, retryDelayMs } from './http-transport';
import type { AccessTokenProvider } from './transport';

/** Refresh this long before the access token actually expires. */
const EXPIRY_MARGIN_MS = 60_000;
const REFRESH_TIMEOUT_MS = 15_000;
/** Network errors, 5xx and 429 from the token endpoint are retried this many times in total. */
const REFRESH_ATTEMPTS = 3;
const DEFAULT_RATE_LIMIT_SECONDS = 60;

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
  #loading: Promise<BcpSession> | null = null;
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

  /** The session in memory, read (or seeded from .env) once, however many callers ask at once. */
  #loadSession(): Promise<BcpSession> {
    if (this.#session) return Promise.resolve(this.#session);
    this.#loading ??= this.#readOrSeedSession().finally(() => {
      this.#loading = null;
    });
    return this.#loading;
  }

  async #readOrSeedSession(): Promise<BcpSession> {
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

  /**
   * Another process sharing the store (e.g. the fixture recorder) may have rotated the refresh
   * token since this one loaded it; BCP would reject the old one. Adopts the stored session when
   * it holds a different refresh token from a later refresh; returns it, or null.
   */
  async #adoptNewerStoredSession(session: BcpSession): Promise<BcpSession | null> {
    const stored = await this.#options.store.load();
    if (!stored?.lastRefreshAt || stored.refreshToken === session.refreshToken) return null;
    if (stored.lastRefreshAt.getTime() <= (session.lastRefreshAt?.getTime() ?? -Infinity)) {
      return null;
    }
    this.#session = stored;
    this.#options.logger.info('Adopted the BCP session another process refreshed');
    return stored;
  }

  #isRejected(session: BcpSession): boolean {
    return session.refreshToken !== null && session.refreshToken === this.#rejectedRefreshToken;
  }

  /**
   * Refresh only when the access token is missing or (nearly) expired. A still-valid access token
   * keeps working after BCP refused the refresh token, so a pasted BCP_ACCESS_TOKEN fallback stays
   * usable; a dead one fails on its first 401, and the transport's refresh() then fails fast.
   */
  #needsRefresh(session: BcpSession): boolean {
    return session.refreshToken !== null && this.#isExpiring(session);
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

  /** POSTs the refresh, retrying network errors, 5xx and 429 with backoff. */
  async #postRefresh(refreshToken: string): Promise<Response> {
    for (let attempt = 1; ; attempt += 1) {
      let response: Response;
      try {
        // Unlike the data endpoints, BCP's token endpoint has no /v1 prefix.
        response = await this.#fetch(new URL('/oauth/token', this.#options.apiUrl), {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'client-id': 'web-app' },
          body: JSON.stringify({ refresh_token: refreshToken, grant_type: 'refresh_token' }),
          signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
        });
      } catch (error) {
        if (attempt >= REFRESH_ATTEMPTS) {
          throw new BcpUnavailableError('Could not reach BCP to refresh the login', error);
        }
        await sleep(retryDelayMs(attempt, null));
        continue;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) return response;
      const retryAfter = response.headers.get('retry-after');
      if (attempt >= REFRESH_ATTEMPTS) {
        if (response.status === 429) {
          throw new BcpRateLimitedError(
            parseRetryAfterSeconds(retryAfter) ?? DEFAULT_RATE_LIMIT_SECONDS,
          );
        }
        throw new BcpUnavailableError(`BCP could not refresh the login (HTTP ${response.status})`);
      }
      await sleep(retryDelayMs(attempt, retryAfter));
    }
  }

  async #doRefresh(): Promise<void> {
    const loaded = await this.#loadSession();
    const adopted = await this.#adoptNewerStoredSession(loaded);
    if (adopted && !this.#isExpiring(adopted)) return;
    const session = adopted ?? loaded;
    if (!session.refreshToken) {
      throw new BcpAuthError('No BCP refresh token configured. Set BCP_REFRESH_TOKEN in .env.');
    }
    if (this.#isRejected(session)) {
      throw new BcpAuthError(`BCP already rejected this refresh token. ${LOG_IN_AGAIN}`);
    }

    const response = await this.#postRefresh(session.refreshToken);
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
    // In memory first: if saving fails, this process still holds the rotated token BCP now expects.
    this.#session = next;
    await this.#options.store.save(next);
    this.#options.logger.info(
      {
        expiresAt: next.accessTokenExpiresAt?.toISOString(),
        rotated: Boolean(parsed.data.refreshToken),
      },
      'Refreshed BCP access token',
    );
  }
}
