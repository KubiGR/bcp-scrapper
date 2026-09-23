import {
  AppError,
  BcpAuthError,
  BcpRateLimitedError,
  BcpUnavailableError,
  NotFoundError,
} from '../errors';
import type { Logger } from '../logger';
import type { RateLimiter } from './rate-limiter';
import type { AccessTokenProvider, BcpRequest, BcpTransport } from './transport';

/** Headers BCP's own web app sends; its API rejects requests without them. */
const BCP_HEADERS = {
  'client-id': 'web-app',
  env: 'bcp',
  accept: 'application/json',
  'user-agent': 'bcp-analyzer/0.1 (private team analysis tool)',
} as const;

const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 10_000;
const MAX_RETRY_AFTER_MS = 60_000;
const DEFAULT_RATE_LIMIT_SECONDS = 60;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function buildUrl(baseUrl: string, { path, query = {} }: BcpRequest): URL {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

export function parseRetryAfterSeconds(header: string | null): number | null {
  if (header === null) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export function retryDelayMs(
  attempt: number,
  retryAfterHeader: string | null,
  random: () => number = Math.random,
): number {
  const retryAfter = parseRetryAfterSeconds(retryAfterHeader);
  if (retryAfter !== null) return Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS);
  const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  return Math.min(backoff + random() * 250, MAX_BACKOFF_MS);
}

export interface HttpTransportOptions {
  baseUrl: string;
  timeoutMs: number;
  maxAttempts: number;
  limiter: RateLimiter;
  /** Null sends requests anonymously. */
  auth: AccessTokenProvider | null;
  logger: Logger;
  fetch?: typeof globalThis.fetch;
}

/** Talks to BCP's web API: rate limited, retried, authenticated. */
export class HttpTransport implements BcpTransport {
  readonly #options: HttpTransportOptions;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: HttpTransportOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async get(request: BcpRequest): Promise<unknown> {
    const { maxAttempts, auth, limiter } = this.#options;
    const url = buildUrl(this.#options.baseUrl, request);
    let refreshedToken = false;

    for (let attempt = 1; ; attempt += 1) {
      let response: Response;
      try {
        response = await limiter.run(() => this.#send(url, request.path, attempt));
      } catch (error) {
        // Our own errors are final, e.g. a login BCP rejected while getting the token:
        // retrying would only re-send it, and wrapping it would hide it.
        if (error instanceof AppError) throw error;
        if (attempt >= maxAttempts) {
          throw new BcpUnavailableError(`Could not reach BCP for ${request.path}`, error);
        }
        await sleep(retryDelayMs(attempt, null));
        continue;
      }

      if (response.ok) return await response.json();

      if (response.status === 401 && auth && !refreshedToken) {
        refreshedToken = true;
        attempt -= 1; // refreshing the token is not a failed attempt
        await auth.refresh();
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new BcpAuthError(
          `BCP refused access to ${request.path} (HTTP ${response.status}). Check the BCP login in Settings.`,
        );
      }
      if (response.status === 404) {
        throw new NotFoundError(`BCP has nothing at ${request.path}`);
      }

      const retryable = response.status === 429 || response.status >= 500;
      const retryAfter = response.headers.get('retry-after');
      if (!retryable || attempt >= maxAttempts) {
        if (response.status === 429) {
          throw new BcpRateLimitedError(
            parseRetryAfterSeconds(retryAfter) ?? DEFAULT_RATE_LIMIT_SECONDS,
          );
        }
        throw new BcpUnavailableError(`BCP returned HTTP ${response.status} for ${request.path}`);
      }
      await sleep(retryDelayMs(attempt, retryAfter));
    }
  }

  async #send(url: URL, path: string, attempt: number): Promise<Response> {
    const headers: Record<string, string> = { ...BCP_HEADERS };
    const token = await this.#options.auth?.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const startedAt = performance.now();
    const response = await this.#fetch(url, {
      headers,
      signal: AbortSignal.timeout(this.#options.timeoutMs),
    });
    this.#options.logger.debug(
      {
        path,
        status: response.status,
        attempt,
        durationMs: Math.round(performance.now() - startedAt),
      },
      'BCP request',
    );
    return response;
  }
}
