import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { defaultForm, newWeapon, withOriginal, type WeaponRow } from './form-state';
import { WeaponEditor } from './WeaponEditor';

const chainblades = {
  ...newWeapon(),
  name: 'Chainblades',
  melee: true,
  attacks: '4',
  skill: 3,
  strength: 8,
  ap: -3,
  damage: '2',
  profiles: [
    {
      name: 'Chainblades',
      melee: true,
      range: null,
      attacks: '4',
      skill: 3,
      strength: 8,
      ap: -3,
      damage: '2',
      keywords: ['Anti-monster 3+', 'Anti-vehicle 3+', 'Hazardous'],
    },
  ],
  profile: 0 as const,
  keywordNames: ['Anti-monster 3+', 'Anti-vehicle 3+', 'Hazardous'],
};

const editor = (
  targetKeywords: string[],
  weapon: WeaponRow = chainblades,
  onChange: (patch: Partial<WeaponRow>) => void = vi.fn(),
) =>
  renderWithProviders(
    <WeaponEditor
      index={0}
      weapon={weapon}
      count={1}
      unit={defaultForm().unit}
      bestName={null}
      sitsOut={null}
      targetKeywords={targetKeywords}
      onChange={onChange}
      onMove={vi.fn()}
      onRemove={vi.fn()}
    />,
  );

describe('WeaponEditor', () => {
  it('marks which datasheet keywords apply to the target', () => {
    editor(['MONSTER', 'CHARACTER']);
    expect(
      screen.getByText(
        'From datasheet: Anti-monster 3+ ✓, Anti-vehicle 3+ (not this target), Hazardous',
      ),
    ).toBeInTheDocument();
  });

  it('shows the datasheet’s Anti in the Anti box, which takes extra ones', () => {
    editor([]);
    expect(screen.getByLabelText('Anti')).toHaveAttribute(
      'placeholder',
      'Datasheet: Anti-monster 3+, Anti-vehicle 3+; add more here',
    );
  });

  it('marks a field changed from the datasheet, with the datasheet’s value', () => {
    const filled = withOriginal(chainblades);
    editor([], { ...filled, attacks: '6', lance: true });
    const attacks = screen.getByLabelText('Attacks');
    expect(attacks).toHaveAttribute('data-changed');
    expect(attacks).toHaveAttribute('title', 'Datasheet: 4');
    expect(screen.getByLabelText('Lance').closest('[data-changed]')).not.toBeNull();
    expect(screen.getByLabelText('Torrent').closest('[data-changed]')).toBeNull();
    expect(screen.getByLabelText('S')).not.toHaveAttribute('data-changed');
  });

  it('puts a changed weapon back to the datasheet', () => {
    const onChange = vi.fn();
    const filled = withOriginal(chainblades);
    editor([], { ...filled, attacks: '6' }, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ attacks: '4' }));
  });

  it('tags a weapon added by hand, and offers no Reset', () => {
    editor([], { ...newWeapon(), name: 'Mine' });
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });
});
