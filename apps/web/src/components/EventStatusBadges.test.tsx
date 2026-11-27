import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { anEvent } from '../test/sample-data';
import { EventStatusBadges } from './EventStatusBadges';

describe('EventStatusBadges', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // During the sample event (2026-03-28 to 2026-03-29).
    vi.setSystemTime(new Date('2026-03-28T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows every badge that applies, in a group that wraps rather than squeezes them', () => {
    renderWithProviders(
      <EventStatusBadges
        event={anEvent({ isTeamEvent: true, isOnline: true, ended: false, hideLists: true })}
      />,
    );
    const labels = ['Teams', 'Online', 'Running', 'Lists hidden', 'Synced'];
    for (const label of labels) expect(screen.getByText(label)).toBeInTheDocument();
    const group = screen.getByText('Teams').closest('.mantine-Group-root');
    expect(group).toHaveStyle({ '--group-wrap': 'wrap' });
  });

  it('shows no badges for a finished, unsynced singles event', () => {
    renderWithProviders(
      <EventStatusBadges event={anEvent({ isTeamEvent: false, lastSyncedAt: null })} />,
    );
    expect(screen.queryByText(/Teams|Online|Running|Lists hidden|Synced/)).toBeNull();
  });

  it('shows the share of available lists still pending next to Synced', () => {
    const event = anEvent({
      playerCount: 55,
      listProgress: { listsAvailable: 50, listsFetched: 38, listsQueued: 5 },
    });
    renderWithProviders(<EventStatusBadges event={event} />);
    expect(screen.getByText('Synced · 24% lists pending').closest('[title]')).toHaveAttribute(
      'title',
      '12 of 50 available lists pending',
    );
  });

  it('shows an Upcoming badge before the event starts', () => {
    vi.setSystemTime(new Date('2026-03-27T12:00:00.000Z'));
    renderWithProviders(<EventStatusBadges event={anEvent({ ended: false })} />);
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.queryByText('Running')).toBeNull();
  });

  it('shows no phase badge once the event has finished', () => {
    vi.setSystemTime(new Date('2026-04-05T12:00:00.000Z'));
    renderWithProviders(<EventStatusBadges event={anEvent({ ended: false })} />);
    expect(screen.queryByText('Running')).toBeNull();
    expect(screen.queryByText('Upcoming')).toBeNull();
  });

  it('treats an event BCP has not closed but that is well past its last day as finished', () => {
    // BCP forgot to set `ended`, but the event's last day is 7 days behind now.
    vi.setSystemTime(new Date('2026-04-05T12:00:00.000Z'));
    renderWithProviders(<EventStatusBadges event={anEvent({ ended: false })} />);
    expect(screen.queryByText('Running')).toBeNull();
  });
});
