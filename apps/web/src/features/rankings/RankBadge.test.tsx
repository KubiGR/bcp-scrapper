import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { RankBadge } from './RankBadge';

describe('RankBadge', () => {
  it('shows a top player’s rank, linking to their page', async () => {
    stubFetchRoutes({ 'GET /api/rankings/top': { ranks: { 'US-ADA': 12 } } });
    renderWithRouter(<RankBadge userId="US-ADA" />);
    const badge = await screen.findByRole('link', { name: 'Ranked #12, top 50' });
    expect(badge).toHaveAttribute('href', '/players/US-ADA');
  });

  it('crowns the top 10, and stars the rest of the top 50 and top 100', async () => {
    stubFetchRoutes({
      'GET /api/rankings/top': { ranks: { 'US-ADA': 8, 'US-BEN': 30, 'US-CAL': 77 } },
    });
    renderWithRouter(
      <>
        <RankBadge userId="US-ADA" />
        <RankBadge userId="US-BEN" />
        <RankBadge userId="US-CAL" />
      </>,
    );
    const tier = async (name: string) =>
      (await screen.findByRole('link', { name }))
        .querySelector('[data-tier]')
        ?.getAttribute('data-tier');
    expect(await tier('Ranked #8, top 10')).toBe('crown');
    expect(await tier('Ranked #30, top 50')).toBe('silver');
    expect(await tier('Ranked #77, top 100')).toBe('bronze');
  });

  it('shows nothing for other players, or without an account', async () => {
    stubFetchRoutes({ 'GET /api/rankings/top': { ranks: { 'US-ADA': 12 } } });
    renderWithRouter(
      <>
        <RankBadge userId="US-BEN" />
        <RankBadge userId={null} />
        <span>done</span>
      </>,
    );
    await screen.findByText('done');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders nothing when the top ranks aren’t loaded', async () => {
    stubFetchRoutes({});
    renderWithRouter(<RankBadge userId="US-ADA" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows a player’s wh40k-elo beside, ranked or not, linking to their page', async () => {
    stubFetchRoutes({
      'GET /api/rankings/top': { ranks: { 'US-ADA': 12 }, elo: { 'US-ADA': 1888, 'US-BEN': 1642 } },
    });
    renderWithRouter(
      <>
        <RankBadge userId="US-ADA" />
        <RankBadge userId="US-BEN" />
        <RankBadge userId="US-CAL" />
      </>,
    );
    expect(await screen.findByRole('link', { name: 'wh40k-elo 1888' })).toHaveTextContent(
      'Elo 1888',
    );
    expect(screen.getByRole('link', { name: 'Ranked #12, top 50' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'wh40k-elo 1642' })).toHaveAttribute(
      'href',
      '/players/US-BEN',
    );
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });
});
