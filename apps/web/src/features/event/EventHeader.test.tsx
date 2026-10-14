import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { twoUpdates } from '../updates/test-updates';
import { anEventDetail } from '../../test/sample-data';
import { EventHeader } from './EventHeader';

describe('EventHeader', () => {
  it('names the game update the event was played under', async () => {
    stubFetchRoutes({ 'GET /api/updates': twoUpdates() });
    renderWithProviders(
      <EventHeader
        event={anEventDetail({ startDate: '2026-06-20T09:00:00.000Z' })}
        syncing={false}
        onRefresh={vi.fn()}
      />,
    );
    expect(await screen.findByText('Update: Jun 2026 · Faction Packs')).toBeInTheDocument();
  });

  it('links to the event on BCP in a new tab', () => {
    renderWithProviders(
      <EventHeader event={anEventDetail()} syncing={false} onRefresh={vi.fn()} />,
    );
    const link = screen.getByRole('link', { name: /Open on BCP/ });
    expect(link).toHaveAttribute('href', 'https://www.bestcoastpairings.com/event/EVT1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('shows flames for a big event, and a leaf for one that started this week', () => {
    renderWithProviders(
      <EventHeader
        event={anEventDetail({
          playerCount: 432,
          startDate: new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString(),
        })}
        syncing={false}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByRole('img', { name: 'Major event' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'New this week' })).toBeInTheDocument();
  });

  it('shows the round count after the size line', () => {
    renderWithProviders(
      <EventHeader
        event={anEventDetail({ playerCount: 432, teamCount: 108, roundCount: 5 })}
        syncing={false}
        onRefresh={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        (_, el) => el?.tagName === 'P' && el.textContent === '432 players · 108 teams · 5 rounds',
      ),
    ).toBeInTheDocument();
  });

  it('omits the round count when it is 0', () => {
    renderWithProviders(
      <EventHeader
        event={anEventDetail({ playerCount: 10, teamCount: null, roundCount: 0 })}
        syncing={false}
        onRefresh={vi.fn()}
      />,
    );
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '10 players'),
    ).toBeInTheDocument();
  });
});
