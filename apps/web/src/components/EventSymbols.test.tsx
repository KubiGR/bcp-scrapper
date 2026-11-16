import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { HotCount, NameWithLeaf, NewLeaf, playedLately, sizeTier } from './EventSymbols';

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

describe('HotCount', () => {
  it('colours the player count by the event’s size, its size in words on hover', () => {
    const size = (players: number) => {
      const { unmount } = renderWithProviders(<HotCount playerCount={players} />);
      const count = screen.getByText(`${String(players)} players`);
      const found = [count.getAttribute('data-size'), count.getAttribute('title')];
      unmount();
      return found;
    };
    expect(size(30)).toEqual(['small', 'Small event']);
    expect(size(60)).toEqual(['medium', 'Medium event']);
    expect(size(150)).toEqual(['large', 'Large event']);
    expect(size(400)).toEqual(['major', 'Major event']);
  });

  it('shows its own text when given one', () => {
    renderWithProviders(<HotCount playerCount={400}>400 players · 80 teams</HotCount>);
    expect(screen.getByText('400 players · 80 teams')).toHaveAttribute('data-size', 'major');
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
