import type { WeaponStep } from '@bcp/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { Breakdown } from './Breakdown';

const step = (s: Partial<WeaponStep> & Pick<WeaponStep, 'name'>): WeaponStep => ({
  attacks: 0,
  hits: 0,
  critHits: 0,
  sustainedHits: 0,
  lethalHits: 0,
  wounds: 0,
  critWounds: 0,
  devastating: 0,
  unsaved: 0,
  unsavedExact: true,
  damage: 0,
  wasted: 0,
  slain: 0,
  ...s,
});

const steps = [
  step({
    name: 'Bolt rifle',
    attacks: 10,
    hits: 25 / 3,
    critHits: 10 / 6,
    sustainedHits: 10 / 6,
    lethalHits: 10 / 6,
    wounds: 5,
    critWounds: 10 / 9,
    unsaved: 5 / 3,
    damage: 5 / 3,
    slain: 1.5,
  }),
  step({
    name: 'Power fist',
    attacks: 3,
    hits: 2,
    wounds: 1.5,
    devastating: 0.25,
    unsaved: 0.75,
    unsavedExact: false,
    damage: 1.5,
    wasted: 0.25,
    slain: 0.5,
  }),
];

const row = (name: string) => {
  const header = screen.getByRole('rowheader', { name });
  const tr = header.closest('tr');
  if (tr === null) throw new Error(`no row ${name}`);
  return within(tr);
};

describe('Breakdown', () => {
  it('shows each weapon’s averages, with what makes up its hits and wounds', () => {
    renderWithProviders(<Breakdown steps={steps} />);
    expect(screen.getByRole('table', { name: 'Step by step' })).toBeInTheDocument();
    const rifle = row('Bolt rifle');
    expect(rifle.getByText('8.33')).toBeInTheDocument();
    expect(rifle.getByText('1.67 crits · +1.67 sus · 1.67 lethals')).toBeInTheDocument();
    expect(rifle.getByText('1.11 crits')).toBeInTheDocument();
    const fist = row('Power fist');
    expect(fist.getByText('0.25 devastating')).toBeInTheDocument();
    // Saves that differ between the target's models: the first allocated's save, marked.
    expect(fist.getByText('≈0.75')).toBeInTheDocument();
  });

  it('adds every weapon up in a Combined row', () => {
    renderWithProviders(<Breakdown steps={steps} />);
    const combined = row('Combined');
    expect(combined.getByText('13.00')).toBeInTheDocument(); // attacks
    expect(combined.getByText('3.17')).toBeInTheDocument(); // damage
    expect(combined.getByText('2.00')).toBeInTheDocument(); // slain
  });

  it('shows the whole table, without a scroll box, for a picture', () => {
    const scroll = '[data-scroll]';
    const page = renderWithProviders(<Breakdown steps={steps} />);
    expect(page.container.querySelector(scroll)).not.toBeNull();
    page.unmount();
    const { container } = renderWithProviders(<Breakdown steps={steps} fit />);
    expect(container.querySelector(scroll)).toBeNull();
    expect(screen.getByRole('table', { name: 'Step by step' })).toBeInTheDocument();
  });
});
