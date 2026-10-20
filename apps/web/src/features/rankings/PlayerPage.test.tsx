import type { PlayerHistoryEntry, PlayerRanking } from '@bcp/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatIsoDay } from '../../lib/format';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { PlayerPage } from './PlayerPage';

const entry = (overrides: Partial<PlayerHistoryEntry> = {}): PlayerHistoryEntry => ({
  playerId: 'PL-ADA',
  eventId: 'E1',
  eventName: 'London GT',
  eventStart: '2026-09-01',
  isTeamEvent: false,
  teamName: null,
  faction: 'Orks',
  detachments: ['War Horde'],
  placing: 1,
  field: 96,
  hasList: true,
  score: 98,
  counts: true,
  fieldElo: 1617,
  ...overrides,
});

const ranking = (overrides: Partial<PlayerRanking> = {}): PlayerRanking => ({
  userId: 'US-ADA',
  name: 'Ada Archer',
  rank: 12,
  ranked: 3456,
  points: 412.34,
  dropsOn: '2027-03-28',
  wh40kElo: null,
  history: [
    entry(),
    entry({
      playerId: 'PL-ADA2',
      eventId: 'E2',
      eventName: 'Team Open',
      eventStart: '2026-03-28',
      isTeamEvent: true,
      teamName: 'Alpha Squad',
      placing: 2,
      field: 20,
      hasList: false,
      score: null,
      counts: false,
      fieldElo: null,
    }),
  ],
  ...overrides,
});

/** A line by its whole text, links inside included. */
const line = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === 'P' && el.textContent === text;

describe('PlayerPage', () => {
  it('shows the player’s rank, points and when a result drops out', async () => {
    stubFetchRoutes({ 'GET /api/rankings/US-ADA': ranking() });
    renderWithRouter(<PlayerPage userId="US-ADA" />);
    expect(await screen.findByRole('heading', { name: 'Ada Archer' })).toBeInTheDocument();
    expect(screen.getByText('#12 of 3,456 · 412.3 points')).toBeInTheDocument();
    expect(
      screen.getByText(`Oldest counted result drops out on ${formatIsoDay('2027-03-28')}`),
    ).toBeInTheDocument();
  });

  it('shows wh40k-elo’s rating with its games, linking the site', async () => {
    stubFetchRoutes({
      'GET /api/rankings/US-ADA': ranking({ wh40kElo: { elo: 1888, games: 1 } }),
    });
    renderWithRouter(<PlayerPage userId="US-ADA" />);
    expect(await screen.findByText(line('wh40k-elo 1888 (1 game)'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'wh40k-elo' })).toHaveAttribute(
      'href',
      'https://wh40k-elo.duckdns.org/',
    );
  });

  it('says when wh40k-elo doesn’t rate a player', async () => {
    stubFetchRoutes({ 'GET /api/rankings/US-ADA': ranking() });
    renderWithRouter(<PlayerPage userId="US-ADA" />);
    expect(await screen.findByText(line('wh40k-elo –'))).toBeInTheDocument();
  });

  it('lists every event, marking the counted ones and linking lists', async () => {
    stubFetchRoutes({ 'GET /api/rankings/US-ADA': ranking() });
    renderWithRouter(<PlayerPage userId="US-ADA" />);
    const rows = within(await screen.findByRole('table', { name: 'History' }))
      .getAllByRole('row')
      .slice(1);
    const [counted, other] = rows;
    if (counted === undefined || other === undefined) throw new Error('missing rows');
    const first = within(counted);
    expect(first.getByRole('link', { name: 'London GT' })).toHaveAttribute(
      'href',
      '/events/E1?tab=players',
    );
    expect(first.getByText('1st of 96')).toBeInTheDocument();
    expect(first.getByText('98.0')).toBeInTheDocument();
    // The field's strength, and how much it weighs the score.
    expect(first.getByText('1617')).toHaveAttribute('title', 'Average wh40k-elo · score ×1.33');
    expect(first.getByLabelText('Counts')).toBeInTheDocument();
    expect(first.getByRole('link', { name: 'List' })).toHaveAttribute(
      'href',
      '/events/E1?tab=players&list=PL-ADA',
    );
    expect(other).toHaveAttribute('data-counted', 'false');
    expect(within(other).getByText('2nd of 20 teams')).toBeInTheDocument();
    expect(within(other).queryByRole('link', { name: 'List' })).not.toBeInTheDocument();
    expect(within(other).getByTitle('Too few rated players to tell · score ×1')).toHaveTextContent(
      '–',
    );
  });

  it('marks an event that started in the last week with a leaf', async () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString().slice(0, 10);
    stubFetchRoutes({
      'GET /api/rankings/US-ADA': ranking({ history: [entry({ eventStart: recent })] }),
    });
    renderWithRouter(<PlayerPage userId="US-ADA" />);
    expect(await screen.findByRole('img', { name: 'New this week' })).toBeInTheDocument();
  });

  it('says when a player isn’t ranked', async () => {
    stubFetchRoutes({
      'GET /api/rankings/US-ADA': ranking({ rank: null, points: 0, dropsOn: null }),
    });
    renderWithRouter(<PlayerPage userId="US-ADA" />);
    expect(
      await screen.findByText('Not ranked: no counted results in the last 12 months.'),
    ).toBeInTheDocument();
  });

  it('says when there’s no such player', async () => {
    stubFetchRoutes({
      'GET /api/rankings/US-NOBODY': () =>
        Response.json(
          { error: { code: 'NOT_FOUND', message: 'No player with that account' } },
          { status: 404 },
        ),
    });
    renderWithRouter(<PlayerPage userId="US-NOBODY" />);
    expect(await screen.findByText('No player with that account.')).toBeInTheDocument();
  });
});
