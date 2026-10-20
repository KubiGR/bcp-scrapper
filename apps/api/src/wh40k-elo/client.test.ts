import { describe, expect, it } from 'vitest';
import { readLeaderboardPage } from './client';

describe('readLeaderboardPage', () => {
  it('reads the site’s leaderboard page into players by BCP account', () => {
    const page = readLeaderboardPage({
      items: [
        {
          player_id: 'L8GE7LCQ0B',
          player_name: 'Conan Jennings',
          current_elo: 2163.64,
          peak_elo: 2163.64,
          matches_played: 133,
          wins: 125,
          losses: 7,
          draws: 1,
          win_rate: 94.0,
          team: 'Gem Wargaming',
          last_active_date: '2026-08-08T13:00:00+00:00',
        },
      ],
      total: 69730,
      page: 1,
      page_size: 200,
      total_pages: 349,
    });
    expect(page).toEqual({
      totalPages: 349,
      players: [
        {
          userId: 'L8GE7LCQ0B',
          name: 'Conan Jennings',
          elo: 2163.64,
          peak: 2163.64,
          games: 133,
          wins: 125,
          losses: 7,
          draws: 1,
          lastActive: new Date('2026-08-08T13:00:00Z'),
        },
      ],
    });
  });

  it('refuses a page whose shape changed', () => {
    expect(() => readLeaderboardPage({ results: [] })).toThrow();
  });
});
