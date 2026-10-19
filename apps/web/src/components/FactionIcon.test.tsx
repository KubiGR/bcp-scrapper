import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { FactionIcon, factionIconSlug } from './FactionIcon';

describe('FactionIcon', () => {
  it('names each faction’s icon file after it', () => {
    expect(factionIconSlug('Space Marines (Astartes)')).toBe('space-marines-astartes');
    expect(factionIconSlug('T’au Empire')).toBe('t-au-empire');
    expect(factionIconSlug("T'au Empire")).toBe('t-au-empire');
    expect(factionIconSlug("Emperor's Children")).toBe('emperor-s-children');
  });

  it('shows a faction’s icon, hidden from screen readers (its name is beside it)', () => {
    const { container } = renderWithProviders(<FactionIcon faction="Orks" />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/factions/orks.png');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows nothing for a faction without an icon, or none at all', () => {
    const agents = renderWithProviders(<FactionIcon faction="Imperial Agents" />);
    expect(agents.container.querySelector('img')).toBeNull();
    const unknown = renderWithProviders(<FactionIcon faction={null} />);
    expect(unknown.container.querySelector('img')).toBeNull();
  });
});
