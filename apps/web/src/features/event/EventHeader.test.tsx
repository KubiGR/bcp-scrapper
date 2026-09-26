import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { anEventDetail } from '../../test/sample-data';
import { EventHeader } from './EventHeader';

describe('EventHeader', () => {
  it('links to the event on BCP in a new tab', () => {
    renderWithProviders(
      <EventHeader event={anEventDetail()} syncing={false} onRefresh={vi.fn()} />,
    );
    const link = screen.getByRole('link', { name: /Open on BCP/ });
    expect(link).toHaveAttribute('href', 'https://www.bestcoastpairings.com/event/EVT1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noreferrer');
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
