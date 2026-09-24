import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
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
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp={false} />);

    const nameButton = await screen.findByRole('button', { name: 'Ada Archer' });
    nameButton.focus();
    fireEvent.click(nameButton);

    expect(await screen.findByText(/Gladius Task Force/)).toBeInTheDocument();
  });

  it('groups a team event’s players by team, collapsibly', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [
          aPlayer({
            bcpId: 'P1',
            name: 'Ada Archer',
            teamId: 'TM-ALPHA',
            teamName: 'Alpha Squad',
            teamPlacing: 2,
          }),
          aPlayer({
            bcpId: 'P2',
            name: 'Cara Cole',
            teamId: 'TM-CHARLIE',
            teamName: 'Charlie Wing',
            teamPlacing: 1,
          }),
        ],
      },
    });
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp={false} />);
    const charlie = await screen.findByRole('button', { name: /Charlie Wing/ });
    const alpha = screen.getByRole('button', { name: /Alpha Squad/ });
    expect(charlie.compareDocumentPosition(alpha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(charlie).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(charlie);
    expect(charlie).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows a team’s placing before its name in the group header, or “—” without one', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [
          aPlayer({
            bcpId: 'P1',
            name: 'Ada Archer',
            teamId: 'TM-ALPHA',
            teamName: 'Alpha Squad',
            teamPlacing: 2,
          }),
          aPlayer({
            bcpId: 'P2',
            name: 'Cara Cole',
            teamId: 'TM-CHARLIE',
            teamName: 'Charlie Wing',
            teamPlacing: null,
          }),
          aPlayer({
            bcpId: 'P3',
            name: 'Nyx None',
            teamId: null,
            teamName: null,
            teamPlacing: null,
          }),
        ],
      },
    });
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp={false} />);

    const alpha = await screen.findByRole('button', {
      name: (_, el) => el.textContent.startsWith('#2') && el.textContent.includes('Alpha Squad'),
    });
    expect(alpha).toBeInTheDocument();

    const charlie = screen.getByRole('button', {
      name: (_, el) => el.textContent.startsWith('—') && el.textContent.includes('Charlie Wing'),
    });
    expect(charlie).toBeInTheDocument();

    const noTeam = screen.getByRole('button', {
      name: (_, el) => el.textContent.startsWith('No team'),
    });
    expect(noTeam).toBeInTheDocument();
  });

  it('shows the no-players message for a team event with no players yet', async () => {
    stubFetchRoutes({ 'GET /api/events/EVT1/players': { items: [] } });
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp={false} />);
    expect(
      await screen.findByText('No players loaded yet. Use "Refresh from BCP".'),
    ).toBeInTheDocument();
  });

  it('shows the no-match message for a team event whose filter matches nothing', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [aPlayer({ bcpId: 'P1', name: 'Ada Archer', teamId: 'TM-ALPHA' })],
      },
    });
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp={false} />);
    await screen.findByRole('button', { name: /Alpha Squad/ });
    fireEvent.change(screen.getByLabelText('Search players'), {
      target: { value: 'nobody matches this' },
    });
    expect(await screen.findByText('No players match the filter.')).toBeInTheDocument();
  });

  it('shows the loading message for a team event while loading from BCP', async () => {
    stubFetchRoutes({ 'GET /api/events/EVT1/players': { items: [] } });
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp />);
    expect(await screen.findByText('Loading players from BCP…')).toBeInTheDocument();
  });

  it('links each team group header to its team page, but not the "No team" group', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [
          aPlayer({
            bcpId: 'P1',
            name: 'Ada Archer',
            teamId: 'TM-ALPHA',
            teamName: 'Alpha Squad',
            teamPlacing: 2,
          }),
          aPlayer({
            bcpId: 'P2',
            name: 'Nyx None',
            teamId: null,
            teamName: null,
            teamPlacing: null,
          }),
        ],
      },
    });
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp={false} />);
    const teamLink = await screen.findByRole('link', { name: 'Alpha Squad team page' });
    expect(teamLink).toHaveAttribute('href', '/events/EVT1/teams/TM-ALPHA');
    expect(screen.queryByRole('link', { name: /No team team page/ })).not.toBeInTheDocument();
  });
});
