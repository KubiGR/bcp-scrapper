import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import {
  FactionIcon,
  factionIconSlug,
  renderFactionOption,
  renderFactionPill,
} from './FactionIcon';

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

  it('knows a faction by its other names', () => {
    const src = (faction: string) =>
      renderWithProviders(<FactionIcon faction={faction} />)
        .container.querySelector('img')
        ?.getAttribute('src');
    expect(src('Genestealer Cult')).toBe('/factions/genestealer-cults.png');
    expect(src('Space Marines')).toBe('/factions/space-marines-astartes.png');
    expect(src('Adeptus Astartes')).toBe('/factions/space-marines-astartes.png');
    expect(src('Asuryani')).toBe('/factions/aeldari.png');
    expect(src('Heretic Astartes')).toBe('/factions/chaos-space-marines.png');
    expect(src('Legiones Daemonica')).toBe('/factions/chaos-daemons.png');
  });

  it('shows nothing for a faction without an icon, or none at all', () => {
    const agents = renderWithProviders(<FactionIcon faction="Imperial Agents" />);
    expect(agents.container.querySelector('img')).toBeNull();
    const unknown = renderWithProviders(<FactionIcon faction={null} />);
    expect(unknown.container.querySelector('img')).toBeNull();
  });
});

describe('renderFactionOption', () => {
  it('shows a faction’s icon by its option in a dropdown', () => {
    const { container } = renderWithProviders(
      <>{renderFactionOption({ option: { value: 'Orks', label: 'Orks (12)' } })}</>,
    );
    expect(container.querySelector('img')).toHaveAttribute('src', '/factions/orks.png');
    expect(container).toHaveTextContent('Orks (12)');
  });
});

describe('renderFactionPill', () => {
  it('shows a picked faction with its icon, still removable', () => {
    const onRemove = vi.fn();
    const { container } = renderWithProviders(
      <>{renderFactionPill({ option: { value: 'Orks', label: 'Orks' }, onRemove })}</>,
    );
    expect(container.querySelector('img')).toHaveAttribute('src', '/factions/orks.png');
    expect(container).toHaveTextContent('Orks');
    // Mantine hides a pill's remove button from screen readers: Backspace removes it instead.
    fireEvent.click(screen.getByRole('button', { hidden: true }));
    expect(onRemove).toHaveBeenCalled();
  });
});
