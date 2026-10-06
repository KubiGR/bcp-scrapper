import type { MathhammerList } from '@bcp/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { ListPicker } from './ListPicker';
import { CAPTAIN, INTERCESSORS } from './unit-fixtures';

const list: MathhammerList = {
  army: 'Space Marines (Astartes)',
  datasheets: [INTERCESSORS, CAPTAIN],
  units: [
    {
      label: 'Captain',
      name: 'Captain',
      datasheetId: CAPTAIN.id,
      attachedTo: 1,
      unread: ['Relic shield'],
      groups: [],
    },
    {
      label: 'Intercessor Squad ×5',
      name: 'Intercessor Squad',
      datasheetId: INTERCESSORS.id,
      attachedTo: null,
      unread: ['Twin dakkagun'],
      groups: [],
    },
    {
      label: 'Made Up',
      name: 'Made Up',
      datasheetId: null,
      attachedTo: null,
      unread: ['Made Up'],
      groups: [],
    },
  ],
};

describe('ListPicker', () => {
  it('reads a pasted list, offers its units, says what it couldn’t read, and uses the pick', async () => {
    const fetchMock = stubFetchRoutes({ 'POST /api/mathhammer/list': list });
    const onPick = vi.fn();
    renderWithProviders(<ListPicker label="Attacker" onPick={onPick} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Attacker list' }), {
      target: { value: 'my list' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read list' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const unit = await screen.findByRole('combobox', { name: 'Attacker list unit' });
    fireEvent.click(unit);
    fireEvent.click(await screen.findByRole('option', { name: 'Intercessor Squad ×5 + Captain' }));
    expect(screen.getByText('Couldn’t read: Twin dakkagun, Relic shield')).toBeInTheDocument();
    expect(screen.getByText('Couldn’t read: Made Up')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(onPick).toHaveBeenCalledWith(list, 1);
  });

  it('says when a list has no units it can read', async () => {
    stubFetchRoutes({ 'POST /api/mathhammer/list': { army: null, units: [], datasheets: [] } });
    renderWithProviders(<ListPicker label="Defender" onPick={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Defender list' }), {
      target: { value: '* [L1] Farsight [70]' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read list' }));
    expect(await screen.findByText('No units found in this list')).toBeInTheDocument();
  });

  it('finds a stored BCP list by player or event and opens it', async () => {
    stubFetchRoutes({
      'GET /api/mathhammer/lists/PL-1': list,
      'GET /api/mathhammer/lists': {
        lists: [
          {
            playerId: 'PL-1',
            player: 'Ada',
            event: 'Big GT',
            faction: 'Space Marines (Astartes)',
            date: '2026-09-01T00:00:00.000Z',
          },
        ],
      },
    });
    renderWithProviders(<ListPicker label="Attacker" onPick={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Pick from BCP' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Attacker BCP list' }), {
      target: { value: 'Ada' },
    });
    fireEvent.click(await screen.findByRole('combobox', { name: 'Attacker stored list' }));
    fireEvent.click(await screen.findByRole('option', { name: /Ada · Big GT/ }));
    expect(await screen.findByRole('combobox', { name: 'Attacker list unit' })).toBeInTheDocument();
  });
});
