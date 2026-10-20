import { z } from 'zod';

/** wh40k-elo: an Elo site built from BCP's games, rating players by their BCP account. */
export const WH40K_ELO_SITE = 'https://wh40k-elo.duckdns.org/';
/** The most players the site gives per leaderboard page. */
export const WH40K_ELO_PAGE_SIZE = 200;

const PlayerSchema = z.object({
  player_id: z.string().min(1),
  player_name: z.string(),
  current_elo: z.number(),
  peak_elo: z.number().nullable().optional(),
  matches_played: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  draws: z.number().int(),
  last_active_date: z.string().nullable().optional(),
});
const PageSchema = z.object({
  items: z.array(PlayerSchema),
  total_pages: z.number().int().nonnegative(),
});

export interface Wh40kEloPlayer {
  userId: string;
  name: string;
  elo: number;
  peak: number | null;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  lastActive: Date | null;
}

export interface Wh40kEloPage {
  players: Wh40kEloPlayer[];
  totalPages: number;
}

export interface Wh40kEloClient {
  /** One page (from 1) of the all-time leaderboard. */
  leaderboard(page: number): Promise<Wh40kEloPage>;
}

/** Reads a leaderboard page as the site answers it; throws if its shape changed. */
export function readLeaderboardPage(body: unknown): Wh40kEloPage {
  const page = PageSchema.parse(body);
  return {
    totalPages: page.total_pages,
    players: page.items.map((item) => {
      const active = item.last_active_date ? new Date(item.last_active_date) : null;
      return {
        userId: item.player_id,
        name: item.player_name,
        elo: item.current_elo,
        peak: item.peak_elo ?? null,
        games: item.matches_played,
        wins: item.wins,
        losses: item.losses,
        draws: item.draws,
        lastActive: active !== null && !Number.isNaN(active.getTime()) ? active : null,
      };
    }),
  };
}

export function httpWh40kEloClient(options: { timeoutMs?: number } = {}): Wh40kEloClient {
  const timeoutMs = options.timeoutMs ?? 30_000;
  return {
    async leaderboard(page) {
      const url = new URL('/api/leaderboard', WH40K_ELO_SITE);
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(WH40K_ELO_PAGE_SIZE));
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'bcp-analyzer', accept: 'application/json' },
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`wh40k-elo answered ${String(response.status)}`);
      return readLeaderboardPage(await response.json());
    },
  };
}
