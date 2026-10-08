import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { RatingsTable } from './RatingsTable';

const p = (id: string, faction: string) => ({ id, name: id, faction, detachments: [], list: null });
const ours = ['A', 'B'].map((id) => p(id, 'Space Marines'));
const theirs = ['X', 'Y'].map((id) => p(id, 'Orks'));

describe('RatingsTable', () => {
  it('shows each rating, marks unrated games, and saves a picked chip', () => {
    const onRate = vi.fn();
    renderWithProviders(
      <RatingsTable
        ours={ours}
        theirs={theirs}
        ratings={[{ playerId: 'A', opponentPlayerId: 'Y', chip: 'RR' }]}
        onRate={onRate}
      />,
    );
    expect(screen.getByRole('button', { name: 'A v Y: RR' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'A v X: unrated' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'GG' }));
    expect(onRate).toHaveBeenCalledWith('A', 'X', 'GG');
  });

  it('clears a rating', () => {
    const onRate = vi.fn();
    renderWithProviders(
      <RatingsTable
        ours={ours}
        theirs={theirs}
        ratings={[{ playerId: 'A', opponentPlayerId: 'Y', chip: 'RR' }]}
        onRate={onRate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'A v Y: RR' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(onRate).toHaveBeenCalledWith('A', 'Y', null);
  });
});
