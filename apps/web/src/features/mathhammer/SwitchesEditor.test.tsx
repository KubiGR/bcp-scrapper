import { DEFAULT_MODS } from '@bcp/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { DEFAULT_SITUATION, defaultForm } from './form-state';
import { SituationPanel } from './SituationPanel';
import { SwitchesEditor } from './SwitchesEditor';

describe('SwitchesEditor', () => {
  it('marks switches changed from the default, boxes its checkboxes, and resets them', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <SwitchesEditor
        mods={{ ...DEFAULT_MODS, hitReroll: 'ones', lethalHits: true, critHitOn: 5 }}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Re-roll hits' })).toHaveAttribute(
      'title',
      'Default: No re-roll',
    );
    expect(screen.getByRole('combobox', { name: 'Critical hit' })).toHaveAttribute(
      'title',
      'Default: 6+',
    );
    const lethal = screen.getByLabelText('Lethal Hits');
    expect(lethal).toHaveAttribute('title', 'Default: off');
    expect(lethal.closest('[class*="checkCell"]')).not.toBeNull();
    expect(screen.getByLabelText('Re-roll one hit')).not.toHaveAttribute('data-changed');
    fireEvent.click(screen.getByRole('button', { name: 'Reset modifiers' }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_MODS);
  });

  it('groups the switches into titled sections', () => {
    renderWithProviders(<SwitchesEditor mods={DEFAULT_MODS} onChange={vi.fn()} />);
    expect(
      within(screen.getByRole('group', { name: 'Hit roll' })).getByLabelText('Lethal Hits'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Wound roll' })).getByLabelText(
        'Devastating Wounds',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Saves and damage' })).getByLabelText(
        'Re-roll damage',
      ),
    ).toBeInTheDocument();
  });

  it('keeps its reset in place, greyed out, while nothing is changed (the page never jumps)', () => {
    renderWithProviders(<SwitchesEditor mods={DEFAULT_MODS} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Reset modifiers' })).toBeDisabled();
  });
});

describe('SituationPanel', () => {
  it('starts at half range with the target in cover, the usual case', () => {
    expect(DEFAULT_SITUATION.halfRange).toBe(true);
    expect(DEFAULT_SITUATION.cover).toBe(true);
    expect(defaultForm().situation).toEqual(DEFAULT_SITUATION);
  });

  it('marks situations changed from the defaults, boxes them, and resets them', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <SituationPanel
        situation={{ ...DEFAULT_SITUATION, charged: true, halfRange: false }}
        onChange={onChange}
      />,
    );
    const charged = screen.getByLabelText('Charged (Lance)');
    expect(charged).toHaveAttribute('title', 'Default: off');
    expect(charged.closest('[class*="checkCell"]')).not.toBeNull();
    expect(screen.getByLabelText('Half range (Rapid Fire, Melta)')).toHaveAttribute(
      'title',
      'Default: on',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset situation' }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_SITUATION);
  });

  it('keeps Reset situation in place, greyed out, at the defaults', () => {
    renderWithProviders(<SituationPanel situation={DEFAULT_SITUATION} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Reset situation' })).toBeDisabled();
    expect(screen.getByLabelText('Half range (Rapid Fire, Melta)')).not.toHaveAttribute('title');
  });
});
