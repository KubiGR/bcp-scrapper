import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { anEvent } from '../test/sample-data';
import { EventStatusBadges } from './EventStatusBadges';

describe('EventStatusBadges', () => {
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
});
