import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Loopback by default, so the API is not reachable from the network. */
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1).default('postgres://bcp:bcp@localhost:5434/bcp'),
  TOURNAMENT_SOURCE: z.enum(['bcp', 'fixtures']).default('fixtures'),
  /** Resolved against the API's working directory (apps/api when run via pnpm). */
  FIXTURES_DIR: z.string().min(1).default('../../fixtures/bcp/sample'),
  BCP_API_URL: z.url().default('https://newprod-api.bestcoastpairings.com'),
  BCP_REFRESH_TOKEN: z.string().min(1).optional(),
  BCP_ACCESS_TOKEN: z.string().min(1).optional(),
  BCP_REQUESTS_PER_SECOND: z.coerce.number().positive().default(2),
  BCP_MAX_CONCURRENCY: z.coerce.number().int().positive().default(2),
  BCP_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  BCP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(4),
  /** One fetch-queue job (a list, an event or a pairings round) every N ms. Keep it gentle. */
  FETCH_QUEUE_INTERVAL_MS: z.coerce.number().int().min(100).default(5000),
  /** Events smaller than this are not stored or shown (RTTs and small events). */
  MIN_EVENT_ROUNDS: z.coerce.number().int().min(0).default(4),
  /** Events smaller than this are not stored or shown (RTTs and small events). */
  MIN_EVENT_PLAYERS: z.coerce.number().int().min(0).default(20),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // `KEY=` in .env yields "", which should mean "not set" rather than "invalid".
  const defined = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  // Plan 3 called it LIST_QUEUE_INTERVAL_MS; keep honouring existing .env files.
  defined.FETCH_QUEUE_INTERVAL_MS ??= defined.LIST_QUEUE_INTERVAL_MS;
  const result = EnvSchema.safeParse(defined);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
