import type { GameView } from '@bcp/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { GamesTable } from './GamesTable';

const player = (overrides: Partial<GameView['playerA']> = {}): GameView['playerA'] => ({
  id: 'P1',
  name: 'Rhea Stone',
  faction: 'Adepta Sororitas',
  teamId: null,
  factionGuessed: false,
  detachments: [],
  disposition: null,
  ...overrides,
});

const game = (overrides: Partial<GameView> = {}): GameView => ({
  id: 'G1',
  tableNo: 1,
  playerA: player(),
  playerB: player({ id: 'P2', name: 'Bea Moss', faction: 'Necrons' }),
  gamePointsA: 20,
  gamePointsB: 0,
  vpA: null,
  vpB: null,
  firstTurn: null,
  result: 'a_win',
  ...overrides,
});

function renderTable(games: GameView[]) {
  renderWithProviders(<GamesTable games={games} />);
}

describe('GamesTable', () => {
  it('shows the faction and a disposition badge under a player’s name', () => {
    renderTable([
      game({
        playerA: player({ faction: 'Adepta Sororitas', disposition: 'Take and Hold' }),
      }),
    ]);
    expect(screen.getByText(/Adepta Sororitas/)).toBeInTheDocument();
    expect(screen.getByText('Take and Hold')).toBeInTheDocument();
  });

  it('shows just the faction, with no disposition text, when disposition is null', () => {
    renderTable([game({ playerA: player({ faction: 'Adepta Sororitas', disposition: null }) })]);
    expect(screen.getByText('Adepta Sororitas')).toBeInTheDocument();
    expect(screen.queryByText('·')).not.toBeInTheDocument();
  });

  it('shows "Unknown faction" when faction is null, same as today', () => {
    renderTable([game({ playerA: player({ faction: null, disposition: 'Disruption' }) })]);
    expect(screen.getByText(/Unknown faction/)).toBeInTheDocument();
    expect(screen.getByText('Disruption')).toBeInTheDocument();
  });
});
