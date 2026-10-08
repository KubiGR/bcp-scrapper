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
    // A grid square is planning: the bar goes back to nothing chosen, showing that square.
    fireEvent.click(
      screen.getByRole('button', { name: /^You defend Space Marines, they defend Orks/ }),
    );
    expect(screen.getByLabelText('You defend')).toHaveValue('');
    expect(
      screen.getByRole('option', { name: 'Not set · suggested Space Marines' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Not set · likely Orks' })).toBeInTheDocument();
  });

  it('players used up in the live pairing are greyed out in the table, their games marked', () => {
    renderWithProviders(<PairingsPage />);
    paste(SHEET);
    fireEvent.click(screen.getByRole('button', { name: 'Use these ratings' }));
    // World Eaters defends against Custodes.
    fireEvent.change(screen.getByLabelText('You defend'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('They defend'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('They send'), { target: { value: '1,2' } });
    fireEvent.change(screen.getByLabelText('You take'), { target: { value: '2' } });
    const table = within(screen.getByRole('table', { name: 'Ratings' }));
    expect(table.getByRole('rowheader', { name: /World Eaters/ })).toHaveAttribute(
      'data-used',
      'true',
    );
    expect(table.getByRole('columnheader', { name: /Orks/ })).toHaveAttribute('data-used', 'true');
    expect(table.getByRole('rowheader', { name: /Space Marines/ })).not.toHaveAttribute(
      'data-used',
    );
    expect(
      table.getByRole('button', { name: /^World Eaters v John: .*, locked in$/ }),
    ).toBeInTheDocument();
  });

  it('each defender chosen in the follow bar greys out; the grid alone does not, and Clear undoes it', () => {
    renderWithProviders(<PairingsPage />);
    paste(SHEET);
    fireEvent.click(screen.getByRole('button', { name: 'Use these ratings' }));
    const table = () => within(screen.getByRole('table', { name: 'Ratings' }));
    fireEvent.click(
      screen.getByRole('button', { name: /^You defend Space Marines, they defend Orks/ }),
    );
    expect(table().getByRole('rowheader', { name: /Space Marines/ })).not.toHaveAttribute(
      'data-used',
    );
    fireEvent.change(screen.getByLabelText('You defend'), { target: { value: '3' } });
    expect(table().getByRole('rowheader', { name: /World Eaters/ })).toHaveAttribute(
      'data-used',
      'true',
    );
    // Theirs only once chosen too.
    expect(table().getByRole('columnheader', { name: /Orks/ })).not.toHaveAttribute('data-used');
    fireEvent.change(screen.getByLabelText('They defend'), { target: { value: '2' } });
    expect(table().getByRole('columnheader', { name: /Orks/ })).toHaveAttribute(
      'data-used',
      'true',
    );
    expect(table().getByRole('rowheader', { name: /World Eaters/ })).toHaveAttribute(
      'data-used',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(table().getByRole('rowheader', { name: /World Eaters/ })).not.toHaveAttribute(
      'data-used',
    );
  });

  it('Clear starts the pairing over: suggested defenders, our best send, nothing followed', () => {
    renderWithProviders(<PairingsPage />);
    paste(SHEET);
    fireEvent.click(screen.getByRole('button', { name: 'Use these ratings' }));
    const select = (label: string) => screen.getByLabelText<HTMLSelectElement>(label);
    const start = {
      youDefend: select('You defend').value,
      theyDefend: select('They defend').value,
      youSend: select('You send').value,
    };
    const other = (label: string) => {
      const select = screen.getByLabelText<HTMLSelectElement>(label);
      const next = [...select.options].find((o) => o.value !== select.value && o.value !== '');
      fireEvent.change(select, { target: { value: next?.value } });
    };
    other('You defend');
    other('They defend');
    other('You send');
    other('They send');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(start).toEqual({ youDefend: '', theyDefend: '', youSend: '' });
    expect(screen.getByLabelText('You defend')).toHaveValue(start.youDefend);
    expect(screen.getByLabelText('They defend')).toHaveValue(start.theyDefend);
    expect(screen.getByLabelText('You send')).toHaveValue(start.youSend);
    expect(screen.getByLabelText('They send')).toHaveValue('');
    expect(
      within(screen.getByRole('table', { name: 'Ratings' }))
        .queryAllByRole('rowheader', { name: /./ })
        .filter((h) => h.hasAttribute('data-used')),
    ).toHaveLength(0);
  });

  it('choices made in the follow bar stay chosen as the pairing goes on', () => {
    renderWithProviders(<PairingsPage />);
    paste(SHEET);
    fireEvent.click(screen.getByRole('button', { name: 'Use these ratings' }));
    fireEvent.change(screen.getByLabelText('You defend'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('They defend'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('You send'), { target: { value: '1,4' } });
    fireEvent.change(screen.getByLabelText('They send'), { target: { value: '1,2' } });
    fireEvent.change(screen.getByLabelText('You take'), { target: { value: '2' } });
    expect(screen.getByLabelText('You defend')).toHaveValue('3');
    expect(screen.getByLabelText('They defend')).toHaveValue('4');
    expect(screen.getByLabelText('You send')).toHaveValue('1,4');
    expect(screen.getByLabelText('They send')).toHaveValue('1,2');
  });
});
