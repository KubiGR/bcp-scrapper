import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail, aPlayer } from '../../test/sample-data';
import { PlayersPanel } from './PlayersPanel';

// mantine-datatable decides per-column visibility with `useMediaQuery`, which calls
// `window.matchMedia` once after mount even for columns with no `visibleMediaQuery`. The jsdom
// stub in test/setup.ts always reports no match, which would hide every column shortly after
// mount; report a match here so the table's columns render as they do in a real browser.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
});

describe('PlayersPanel', () => {
  it('opens a player list from the keyboard via a focusable player-name button', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': { items: [aPlayer()] },
      'GET /api/players/PL-ADA/list': {
        playerId: 'PL-ADA',
        playerName: 'Ada Archer',
        teamName: 'Alpha Squad',
        faction: 'Space Marines',
        listId: 'LS-ADA',
        text: 'Space Marines – Gladius Task Force\n\nCaptain (80 pts)',
        fetchedAt: '2026-09-23T10:00:00.000Z',
      },
    });
    renderWithProviders(<PlayersPanel event={anEventDetail()} loadingFromBcp={false} />);

    const nameButton = await screen.findByRole('button', { name: 'Ada Archer' });
    nameButton.focus();
    fireEvent.click(nameButton);

    expect(await screen.findByText(/Gladius Task Force/)).toBeInTheDocument();
  });
});
