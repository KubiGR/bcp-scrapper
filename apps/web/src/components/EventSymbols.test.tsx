import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { EventHeat, NameWithLeaf, NewLeaf, playedLately, sizeTier } from './EventSymbols';

describe('sizeTier', () => {
  it('steps up with the rankings’ 50, 100 and 200 players', () => {
    expect(sizeTier(12)).toBe('small');
    expect(sizeTier(50)).toBe('medium');
    expect(sizeTier(100)).toBe('large');
    expect(sizeTier(432)).toBe('major');
  });
});

describe('playedLately', () => {
  it('is an event that started in the last week, not one to come', () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    expect(playedLately('2026-10-12T09:00:00Z', now)).toBe(true);
    expect(playedLately('2026-10-01T09:00:00Z', now)).toBe(false);
    expect(playedLately('2026-10-20T09:00:00Z', now)).toBe(false);
  });
});

describe('EventHeat', () => {
  it('shows more flames the bigger the event, none for a small one', () => {
    const flames = (players: number) => {
      const { container, unmount } = renderWithProviders(<EventHeat playerCount={players} />);
      const count = container.querySelectorAll('svg').length;
      unmount();
      return count;
    };
    expect(flames(30)).toBe(0);
    expect(flames(60)).toBe(1);
    expect(flames(150)).toBe(2);
    expect(flames(400)).toBe(3);
  });

  it('names the size for screen readers', () => {
    renderWithProviders(<EventHeat playerCount={400} />);
    expect(screen.getByRole('img', { name: 'Major event' })).toBeInTheDocument();
  });
});

describe('NewLeaf', () => {
  it('is a leaf named for screen readers', () => {
    renderWithProviders(<NewLeaf />);
    expect(screen.getByRole('img', { name: 'New this week' })).toBeInTheDocument();
  });
});

describe('NameWithLeaf', () => {
  it('keeps the leaf on the line of the name’s last word', () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    renderWithProviders(<NameWithLeaf name="GT Madrid Letania" startDate={recent} />);
    const leaf = screen.getByRole('img', { name: 'New this week' });
    expect(leaf.parentElement).toHaveTextContent(/^Letania$/);
  });

  it('is just the name for an older event', () => {
    const { container } = renderWithProviders(
      <NameWithLeaf name="GT Madrid" startDate="2020-01-01T00:00:00.000Z" />,
    );
    expect(container).toHaveTextContent('GT Madrid');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
