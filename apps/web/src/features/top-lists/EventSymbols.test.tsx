import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { EventHeat, NewLeaf } from './EventSymbols';

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
