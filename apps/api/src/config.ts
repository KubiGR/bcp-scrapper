import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Loopback by default, so the API is not reachable from the network. */
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3401),
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
  /** Automatic background fetching of big events (lists from the start, pairings once over); false switches it off. */
  AUTO_FETCH_ENABLED: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((value) => value === 'true' || value === '1'),
  /** Reading each faction's detachments from BSData on GitHub once a day; false switches it off. */
  BSDATA_ENABLED: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((value) => value === 'true' || value === '1'),
  /** Reading Mathhammer's unit data from 39k.pro once a day; false switches it off. */
  RULES_ENABLED: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((value) => value === 'true' || value === '1'),
  /** How often the planner looks for missing events, pairings and lists. */
  AUTO_FETCH_INTERVAL_MS: z.coerce.number().int().min(1000).default(600_000),
  /** Only events that started within this many days are fetched automatically. */
  AUTO_FETCH_DAYS: z.coerce.number().int().min(1).default(60),
  /** How often the latest-window catalogue is refreshed while automatic fetching is on. */
  AUTO_CATALOG_INTERVAL_MS: z.coerce.number().int().min(60_000).default(3_600_000),
  /** The name the app is reached by from outside (e.g. through a Cloudflare Tunnel). */
  PUBLIC_HOSTNAME: z.string().min(1).optional(),
  /** Extra hostnames the Host check admits, comma-separated (e.g. a LAN name). */
  ALLOWED_HOSTS: z.string().optional(),
  /** When set, the API also serves the built web app from this directory. */
  WEB_DIST_DIR: z.string().min(1).optional(),
  /** Logins for everyone; off for local development and tests. */
  AUTH_REQUIRED: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((value) => value === 'true' || value === '1'),
  /** Keys the session id hashes; at least 32 characters. Required when AUTH_REQUIRED is on. */
  SESSION_SECRET: z.string().min(32).optional(),
  /** The first admin, created on start while there are no users yet. */
  ADMIN_USERNAME: z.string().min(1).optional(),
  ADMIN_PASSWORD: z.string().min(1).optional(),
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
  if (result.data.AUTH_REQUIRED && result.data.SESSION_SECRET === undefined) {
    throw new Error('Invalid environment:\nSESSION_SECRET is required when AUTH_REQUIRED is true');
  }
  return result.data;
}

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

/** A hostname as the Host check compares it: lower-cased, without a port. */
function bareHostname(entry: string): string | null {
  const trimmed = entry.trim().toLowerCase();
  if (trimmed === '') return null;
  try {
    return new URL(`http://${trimmed}`).hostname;
  } catch {
    return null;
  }
}

/** Hostnames the API answers to: loopback, the public hostname and ALLOWED_HOSTS. */
export function allowedHostsOf(config: Config): Set<string> {
  const hosts = new Set(LOOPBACK_HOSTS);
  for (const entry of [config.PUBLIC_HOSTNAME ?? '', ...(config.ALLOWED_HOSTS ?? '').split(',')]) {
    const hostname = bareHostname(entry);
    if (hostname !== null) hosts.add(hostname);
  }
  return hosts;
}
