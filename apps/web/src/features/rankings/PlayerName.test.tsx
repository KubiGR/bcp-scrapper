import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '../../test/render';
import { PlayerName } from './PlayerName';

describe('PlayerName', () => {
  it('links a player with an account to their page, without also opening the row', async () => {
    const onRow = vi.fn();
    renderWithRouter(
      <div onClick={onRow}>
        <PlayerName name="Ada Archer" userId="US-ADA" />
      </div>,
    );
    const link = await screen.findByRole('link', { name: 'Ada Archer' });
    expect(link).toHaveAttribute('href', '/players/US-ADA');
    fireEvent.click(link);
    expect(onRow).not.toHaveBeenCalled();
  });

  it('shows a player without an account as plain text', async () => {
    renderWithRouter(<PlayerName name="Hidden Hal" userId={null} />);
    expect(await screen.findByText('Hidden Hal')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
