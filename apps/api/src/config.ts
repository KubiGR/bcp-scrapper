import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1).default('postgres://bcp:bcp@localhost:5432/bcp'),
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
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // `KEY=` in .env yields "", which should mean "not set" rather than "invalid".
  const defined = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const result = EnvSchema.safeParse(defined);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
