import type { DetachmentListsResponse } from '@bcp/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { DetachmentListsButton } from './DetachmentLists';

const lists = (overrides: Partial<DetachmentListsResponse> = {}): DetachmentListsResponse => ({
  lists: [
    {
      playerId: 'PL-ADA',
      playerName: 'Ada Archer',
      faction: 'Chaos Daemons',
      eventId: 'EVT1',
      eventName: 'Sample Open',
      eventStartDate: '2026-09-20T09:00:00.000Z',
      detachments: ['Cabalgata del Caos'],
    },
  ],
  total: 1,
  ...overrides,
});

describe('DetachmentListsButton', () => {
  it('opens the lists that use a name, each showing its text on request', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/detachments/lists': lists(),
      'GET /api/players/PL-ADA/list': {
        playerId: 'PL-ADA',
        playerName: 'Ada Archer',
        teamName: null,
        faction: 'Chaos Daemons',
        listId: 'LS-ADA',
        text: 'Detachment: Cabalgata del Caos\nBloodletters x10',
        fetchedAt: '2026-09-23T10:00:00.000Z',
      },
    });
    renderWithProviders(<DetachmentListsButton name="Cabalgata del Caos" />);
    fireEvent.click(screen.getByRole('button', { name: 'See lists using Cabalgata del Caos' }));
    const drawer = within(await screen.findByRole('dialog'));
    expect(await drawer.findByText('Ada Archer')).toBeInTheDocument();
    expect(drawer.getByText(/Chaos Daemons · Sample Open/)).toBeInTheDocument();
    fireEvent.click(drawer.getByRole('button', { name: /Ada Archer/ }));
    expect(await drawer.findByText(/Bloodletters x10/)).toBeInTheDocument();
    expect(drawer.getByRole('link', { name: /Open in its event/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/events/EVT1?tab=players&list=PL-ADA'),
    );
    const url = fetchMock.mock.calls
      .map(([input]) => (typeof input === 'string' ? input : ''))
      .find((u) => u.startsWith('/api/detachments/lists'));
    expect(url).toBe('/api/detachments/lists?name=Cabalgata+del+Caos');
  });

  it('asks for one faction’s lists, and says when only the newest are shown', async () => {
    const fetchMock = stubFetchRoutes({ 'GET /api/detachments/lists': lists({ total: 54 }) });
    renderWithProviders(<DetachmentListsButton name="Blood Legion" faction="World Eaters" />);
    fireEvent.click(screen.getByRole('button', { name: 'See lists using Blood Legion' }));
    expect(await screen.findByText('The newest 1 of 54 lists')).toBeInTheDocument();
    const url = fetchMock.mock.calls
      .map(([input]) => (typeof input === 'string' ? input : ''))
      .find((u) => u.startsWith('/api/detachments/lists'));
    expect(url).toBe('/api/detachments/lists?name=Blood+Legion&faction=World+Eaters');
  });
});
