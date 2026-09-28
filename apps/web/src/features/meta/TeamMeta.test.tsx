import type { TeamMetaRow } from '@bcp/shared';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { TeamMeta } from './TeamMeta';

const row = (overrides: Partial<TeamMetaRow>): TeamMetaRow => ({
  faction: 'Orks',
  topSlots: 4,
  topShare: 0.1,
  allSlots: 40,
  allShare: 0.1,
  difference: 0,
  archetypes: [],
  ...overrides,
});

describe('TeamMeta', () => {
  it('shows a tiny difference as a neutral 0.0 pp', () => {
    renderWithProviders(
      <TeamMeta rows={[row({ difference: -0.00001 })]} eventsCounted={1} minPlayers={10} />,
    );
    const cell = screen.getByText('0.0 pp');
    expect(cell).toHaveAttribute('data-tone', 'even');
  });

  it('sorts factions on a column header, small ones staying last', () => {
    renderWithProviders(
      <TeamMeta
        rows={[
          row({ faction: 'Orks', allShare: 0.1, difference: 0.05 }),
          row({ faction: 'Necrons', allShare: 0.3, difference: -0.02 }),
          row({ faction: 'Aeldari', allShare: 0.9, allSlots: 2 }),
        ]}
        eventsCounted={1}
        minPlayers={10}
      />,
    );
    const factions = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        // The first cell also holds the expand arrow.
        .map((r) => r.querySelector('td')?.textContent.replace(/^[▸▾]/, ''));
    expect(factions()).toEqual(['Orks', 'Necrons', 'Aeldari']);
    fireEvent.click(screen.getByRole('button', { name: 'All teams' }));
    expect(factions()).toEqual(['Necrons', 'Orks', 'Aeldari']);
  });

  it('dims detachment rows below the minimum', () => {
    renderWithProviders(
      <TeamMeta
        rows={[
          row({
            archetypes: [
              {
                detachments: ['War Horde'],
                topSlots: 3,
                topShare: 0.1,
                allSlots: 30,
                allShare: 0.08,
                difference: 0.02,
              },
              {
                detachments: ['Kult of Speed'],
                topSlots: 1,
                topShare: 0.02,
                allSlots: 3,
                allShare: 0.01,
                difference: 0.01,
              },
            ],
          }),
        ]}
        eventsCounted={1}
        minPlayers={10}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show Orks detachments in teams' }));
    expect(screen.getByText('Kult of Speed').closest('tr')).toHaveAttribute('data-dimmed', 'true');
    expect(screen.getByText('War Horde').closest('tr')).toHaveAttribute('data-dimmed', 'false');
  });
});
