import path from 'node:path';
import type { BcpStatus } from '@bcp/shared';
import type { Config } from '../config';
import type { Db } from '../db/client';
import type { Logger } from '../logger';
import { BcpAuth } from './auth';
import { createDbSessionStore } from './auth-store';
import { FixtureTransport } from './fixture-transport';
import { HttpTransport } from './http-transport';
import { RateLimiter } from './rate-limiter';
import { BcpSource, type TournamentSource } from './source';

export interface SourceBundle {
  source: TournamentSource;
  status: () => Promise<BcpStatus>;
}

export function createSource(config: Config, deps: { db: Db; logger: Logger }): SourceBundle {
  if (config.TOURNAMENT_SOURCE === 'fixtures') {
    const dir = path.resolve(config.FIXTURES_DIR);
    deps.logger.info({ dir }, 'Serving BCP data from fixtures');
    return {
      source: new BcpSource(new FixtureTransport(dir)),
      status: () =>
        Promise.resolve({
          source: 'fixtures',
          authenticated: false,
          accessTokenExpiresAt: null,
          lastRefreshAt: null,
        }),
    };
  }

  if (!config.BCP_REFRESH_TOKEN && !config.BCP_ACCESS_TOKEN) {
    deps.logger.warn(
      'No BCP_REFRESH_TOKEN or BCP_ACCESS_TOKEN set: requests are anonymous and army lists will fail',
    );
  }
  const logger = deps.logger.child({ module: 'bcp' });
  const auth = new BcpAuth({
    apiUrl: config.BCP_API_URL,
    store: createDbSessionStore(deps.db),
    envRefreshToken: config.BCP_REFRESH_TOKEN,
    envAccessToken: config.BCP_ACCESS_TOKEN,
    logger,
  });
  const transport = new HttpTransport({
    baseUrl: config.BCP_API_URL,
    timeoutMs: config.BCP_TIMEOUT_MS,
    maxAttempts: config.BCP_MAX_ATTEMPTS,
    limiter: new RateLimiter({
      requestsPerSecond: config.BCP_REQUESTS_PER_SECOND,
      maxConcurrency: config.BCP_MAX_CONCURRENCY,
    }),
    auth,
    logger,
  });
  return {
    source: new BcpSource(transport),
    status: async () => ({ source: 'bcp', ...(await auth.status()) }),
  };
}
