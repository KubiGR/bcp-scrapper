import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { defaultForm, newWeapon } from './form-state';
import { WeaponEditor } from './WeaponEditor';

const chainblades = {
  ...newWeapon(),
  name: 'Chainblades',
  melee: true,
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

const editor = (targetKeywords: string[]) =>
  renderWithProviders(
    <WeaponEditor
      index={0}
      weapon={chainblades}
      count={1}
      unit={defaultForm().unit}
      bestName={null}
      sitsOut={null}
      targetKeywords={targetKeywords}
      onChange={vi.fn()}
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

  it('says the Anti box is for extra Anti', () => {
    editor([]);
    expect(screen.getByLabelText('Anti')).toHaveAttribute('placeholder', 'Extra, e.g. INFANTRY 4+');
  });
});
