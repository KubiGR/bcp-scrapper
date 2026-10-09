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
        onAlt={() => {}}
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
        onAlt={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'A v Y: RR' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(onRate).toHaveBeenCalledWith('A', 'Y', null);
  });

  it('shows what a game can become, and sets or clears it from the same menu', () => {
    const onAlt = vi.fn();
    renderWithProviders(
      <RatingsTable
        ours={ours}
        theirs={theirs}
        ratings={[
          { playerId: 'A', opponentPlayerId: 'X', chip: 'Y', alt: 'R' },
          { playerId: 'A', opponentPlayerId: 'Y', chip: 'G' },
        ]}
        onRate={() => {}}
        onAlt={onAlt}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'A v X: Y, can become R' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Can become: none' }));
    expect(onAlt).toHaveBeenCalledWith('A', 'X', null);
    fireEvent.click(screen.getByRole('button', { name: 'A v Y: G' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Can become GG' }));
    expect(onAlt).toHaveBeenCalledWith('A', 'Y', 'GG');
  });

  it('shows dispositions as the sheet’s badges, the short lists, and each row’s and column’s average', async () => {
    const us = [
      { ...p('A', 'Space Marines'), disposition: 'Disruption' },
      { ...p('B', 'World Eaters'), disposition: 'Take and Hold' },
    ];
    const them = [
      { ...p('X', 'Orks'), disposition: 'Purge the Foe', list: 'Warboss on Warbike\n6 Warbikers' },
      { ...p('Y', 'Necrons'), disposition: null },
    ];
    renderWithProviders(
      <RatingsTable
        ours={us}
        theirs={them}
        ratings={[
          { playerId: 'A', opponentPlayerId: 'X', chip: 'G' },
          { playerId: 'A', opponentPlayerId: 'Y', chip: 'Y' },
          { playerId: 'B', opponentPlayerId: 'X', chip: 'RR' },
        ]}
        onRate={() => {}}
        onAlt={() => {}}
      />,
    );
    expect(screen.getByTitle('Disruption')).toHaveTextContent('DRP');
    expect(screen.getByTitle('Take and Hold')).toHaveTextContent('T&H');
    expect(screen.getByTitle('Purge the Foe')).toHaveTextContent('PTF');
    // The short list opens from a button, so the headers stay short.
    expect(screen.queryByText('6 Warbikers')).toBeNull();
    // Just a list symbol by the army: no "List · N units" text.
    expect(screen.queryByText(/units/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Orks list' }));
    expect(await screen.findByText('6 Warbikers')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Necrons list' })).toBeNull();
    // Space Marines: G 13 and Y 10 → 11.5 ± 1.5; Orks column: G 13 and RR 2.5 → 7.8 ± 5.3.
    expect(screen.getByLabelText('Space Marines average')).toHaveTextContent('11.5 ± 1.5');
    expect(screen.getByLabelText('Orks average')).toHaveTextContent('7.8 ± 5.3');
    expect(screen.getByLabelText('Necrons average')).toHaveTextContent('10.0 ± 0.0');
  });
});
