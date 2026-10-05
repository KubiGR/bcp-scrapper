import type { CellGame } from '@bcp/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { CellDrawer } from './CellDrawer';

const side = (name: string, faction: string, detachments: string[]) => ({
  name,
  faction,
  factionGuessed: false,
  disposition: null,
  detachments,
  teamName: null,
});
const game = (id: string, player: string, detachments: string[]): CellGame => ({
  id,
  eventId: 'E1',
  eventName: 'Event',
  round: 1,
  tableNo: 1,
  row: side(player, 'Orks', detachments),
  col: side(`Opponent of ${player}`, 'Necrons', []),
  outcome: 'win',
  rowPoints: 15,
  colPoints: 5,
});
const games = [
  game('G1', 'Horde player', ['War Horde']),
  game('G2', 'Speed player', ['Kult of Speed']),
  game('G3', 'No list player', []),
];

describe('CellDrawer', () => {
  it('lists only a detachment’s games when opened from its row', () => {
    renderWithProviders(
      <CellDrawer
        cell={{ row: 'Orks', col: 'Necrons', detachment: 'War Horde' }}
        games={games}
        loading={false}
        error={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Orks · War Horde vs Necrons')).toBeInTheDocument();
    expect(screen.getByText('Horde player')).toBeInTheDocument();
    expect(screen.queryByText('Speed player')).toBeNull();
  });
});
