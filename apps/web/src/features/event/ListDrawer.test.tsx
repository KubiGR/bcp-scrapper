import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aPlayer } from '../../test/sample-data';
import { ListDrawer } from './ListDrawer';

describe('ListDrawer', () => {
  it('shows a fetched list with a copy button', async () => {
    stubFetchRoutes({
      'GET /api/players/PL-ADA/list': {
        playerId: 'PL-ADA',
        playerName: 'Ada Archer',
        teamName: 'Alpha Squad',
        faction: 'Space Marines',
        listId: 'LS-ADA',
        text: 'Space Marines – Gladius Task Force\n\nCaptain (80 pts)',
        fetchedAt: '2026-09-23T10:00:00.000Z',
      },
    });
    renderWithProviders(<ListDrawer player={aPlayer()} onClose={vi.fn()} />);
    expect(await screen.findByText(/Gladius Task Force/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy list' })).toBeInTheDocument();
  });

  it('explains a list that is not fetched yet or was never submitted', () => {
    const { unmount } = renderWithProviders(
      <ListDrawer player={aPlayer({ listStatus: 'available' })} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/hasn't been fetched yet/)).toBeInTheDocument();
    unmount();
    renderWithProviders(<ListDrawer player={aPlayer({ listStatus: 'none' })} onClose={vi.fn()} />);
    expect(screen.getByText(/didn't submit a list/)).toBeInTheDocument();
  });
});
