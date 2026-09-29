import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { RankBadge } from './RankBadge';

describe('RankBadge', () => {
  it('shows a top player’s rank, linking to their page', async () => {
    stubFetchRoutes({ 'GET /api/rankings/top': { ranks: { 'US-ADA': 12 } } });
    renderWithRouter(<RankBadge userId="US-ADA" />);
    const badge = await screen.findByRole('link', { name: 'Ranked #12' });
    expect(badge).toHaveAttribute('href', '/players/US-ADA');
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
});
