import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { PairingsPage } from './PairingsPage';

const row = (...cells: string[]) => cells.join('\t');
const SHEET = [
  row('', 'George', 'Ioannis', 'John', 'Panagiotis', 'Petros'),
  row('', 'Grey Knights', 'Death Guard', 'Orks', 'Chaos Space Marines', 'Adeptus Custodes'),
  row('Space Marines', 'GG', 'Y', 'Y', 'R', 'G'),
  row('Emperor’s Children', 'Y', 'G', 'RR', 'G', 'G'),
  row('Chaos Daemons', 'R', 'G', 'Y', 'R', 'great'),
  row('World Eaters', 'G', 'Y', 'R', 'G', 'G'),
  row('Adepta Sororitas', 'G', 'R', '', 'RR', 'G'),
].join('\n');

const paste = (text: string) => {
  fireEvent.change(screen.getByLabelText('Copied cells'), { target: { value: text } });
};

afterEach(() => {
  localStorage.clear();
});

describe('PairingsPage', () => {
  it('starts from a paste of the sheet and analyses it straight away', () => {
    renderWithProviders(<PairingsPage />);
    paste(SHEET);
    expect(screen.getByText(/23 chips · 1 blank · 1 unreadable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use these ratings' }));
    expect(screen.getByText(/^23 of 25 rated/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Space Marines v George: GG' })).toBeInTheDocument();
    expect(screen.getByText('Expected team score (of 100)')).toBeInTheDocument();
  });

  it('says so when the paste has no ratings', () => {
    renderWithProviders(<PairingsPage />);
    paste('hello\tworld');
    expect(screen.getByText(/No ratings found/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use these ratings' })).toBeNull();
  });

  it('reopens with the last sheet, including chips changed here', () => {
    const { unmount } = renderWithProviders(<PairingsPage />);
    paste(SHEET);
    fireEvent.click(screen.getByRole('button', { name: 'Use these ratings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chaos Daemons v Petros: unrated' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'GG' }));
    expect(screen.getByText(/^24 of 25 rated/)).toBeInTheDocument();
    unmount();
    renderWithProviders(<PairingsPage />);
    expect(screen.getByRole('button', { name: 'Chaos Daemons v Petros: GG' })).toBeInTheDocument();
  });

  it('Paste again replaces the sheet', () => {
    renderWithProviders(<PairingsPage />);
    paste(SHEET);
    fireEvent.click(screen.getByRole('button', { name: 'Use these ratings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Paste again' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Copied cells'), {
      target: { value: Array.from({ length: 5 }, () => row('G', 'G', 'G', 'G', 'G')).join('\n') },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Use these ratings' }));
    expect(screen.getByText(/^25 of 25 rated/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Player 1 v Opponent 1: G' })).toBeInTheDocument();
  });

  it('only the chain spans the full width; the rest keeps the usual centred column', () => {
    renderWithProviders(<PairingsPage />);
    paste(SHEET);
    fireEvent.click(screen.getByRole('button', { name: 'Use these ratings' }));
    const column = (text: string) => screen.getByText(text).closest('.mantine-Container-root');
    expect(column('Rate the games')).not.toBeNull();
    expect(column('Summary')).not.toBeNull();
    expect(column('Round 1 defenders')).not.toBeNull();
    expect(column('The chain')).toBeNull();
  });

  it('the defenders in the follow bar and the grid square move together', () => {
    renderWithProviders(<PairingsPage />);
    paste(SHEET);
    fireEvent.click(screen.getByRole('button', { name: 'Use these ratings' }));
    fireEvent.change(screen.getByLabelText('You defend'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('They defend'), { target: { value: '1' } });
    expect(
      screen.getByRole('button', { name: /^You defend Chaos Daemons, they defend Death Guard/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(
      screen.getByRole('button', { name: /^You defend Space Marines, they defend Orks/ }),
    );
    expect(screen.getByLabelText('You defend')).toHaveValue('0');
    expect(screen.getByLabelText('They defend')).toHaveValue('2');
  });
});
