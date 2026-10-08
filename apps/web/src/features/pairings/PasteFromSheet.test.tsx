import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { PasteFromSheet, type PastedRating } from './PasteFromSheet';

const team = (prefix: string, factions: string[]) =>
  factions.map((faction, i) => ({
    id: `${prefix}${i}`,
    name: `${prefix}-player${i}`,
    faction,
    detachments: [],
    list: null,
  }));
const ours = team('US', [
  'Space Marines',
  'Emperor’s Children',
  'Chaos Daemons',
  'World Eaters',
  'Sororitas',
]);
const theirs = team('TH', ['Grey Knights', 'Death Guard', 'Orks', 'CSM', 'Custodes']);

const SHEET = [
  '\tGK\tDG\tOrks\tCSM\tCustodes',
  'SM\tGG\tY\tY\tR\tG',
  'EC\tY\tG, ?\tRR\tG\tG',
  'CD\tR\tG\tY\tR\tgreat',
  'WE\tG\tY\tR\tG\tG',
  'AS\tG\tR\t\tRR\tG',
].join('\n');

function open(onSave = vi.fn((_ratings: PastedRating[]) => Promise.resolve())) {
  renderWithProviders(<PasteFromSheet ours={ours} theirs={theirs} onSave={onSave} />);
  fireEvent.click(screen.getByRole('button', { name: 'Paste from sheet' }));
  fireEvent.change(screen.getByLabelText('Copied cells'), { target: { value: SHEET } });
  return onSave;
}

describe('PasteFromSheet', () => {
  it('previews the pasted chips and marks what it could not read', () => {
    open();
    const preview = within(screen.getByRole('table', { name: 'Pasted ratings' }));
    expect(preview.getAllByText('GG')).toHaveLength(1);
    expect(preview.getByTitle('Unreadable: left unrated')).toBeInTheDocument();
    expect(screen.getByText(/23 chips · 1 blank · 1 unreadable/)).toBeInTheDocument();
  });

  it('saves all 25 games, matched by order unless a row is reassigned', async () => {
    const onSave = open();
    // The sheet's rows 1 and 2 are the app's players 2 and 1.
    fireEvent.change(screen.getByLabelText('Sheet row 1'), { target: { value: 'US1' } });
    fireEvent.change(screen.getByLabelText('Sheet row 2'), { target: { value: 'US0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save 25 games' }));
    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledOnce();
    });
    const list = onSave.mock.calls[0]?.[0];
    expect(list).toHaveLength(25);
    expect(list).toContainEqual({ playerId: 'US1', opponentPlayerId: 'TH0', chip: 'GG' });
    expect(list).toContainEqual({ playerId: 'US0', opponentPlayerId: 'TH1', chip: 'G' });
    expect(list).toContainEqual({ playerId: 'US4', opponentPlayerId: 'TH2', chip: null });
    expect(list).toContainEqual({ playerId: 'US2', opponentPlayerId: 'TH4', chip: null });
  });

  it('will not save while a player is matched twice', () => {
    open();
    fireEvent.change(screen.getByLabelText('Sheet column 2'), { target: { value: 'TH0' } });
    expect(screen.getByRole('button', { name: 'Save 25 games' })).toBeDisabled();
    expect(screen.getByText(/Each player can be matched once/)).toBeInTheDocument();
  });

  it('says so when the paste has no ratings, and Cancel saves nothing', () => {
    const onSave = vi.fn(() => Promise.resolve());
    renderWithProviders(<PasteFromSheet ours={ours} theirs={theirs} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paste from sheet' }));
    fireEvent.change(screen.getByLabelText('Copied cells'), { target: { value: 'hello\tworld' } });
    expect(screen.getByText(/No ratings found/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
