import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { Clipped } from './Clipped';

/** jsdom has no layout: say how wide the text is against its box. */
function widths(scroll: number, client: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scroll);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(client);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Clipped', () => {
  it('cut-off text shows its whole self in a tooltip on hover', async () => {
    widths(300, 120);
    renderWithProviders(<Clipped>Berzerker Warband + Brazen Engines</Clipped>);
    fireEvent.mouseEnter(screen.getByText('Berzerker Warband + Brazen Engines'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Berzerker Warband + Brazen Engines',
    );
  });

  it('text that fits gets no tooltip', async () => {
    widths(100, 120);
    renderWithProviders(<Clipped>War Horde</Clipped>);
    fireEvent.mouseEnter(screen.getByText('War Horde'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
