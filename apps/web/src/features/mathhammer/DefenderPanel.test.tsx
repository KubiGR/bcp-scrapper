import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { defenderFrom } from './datasheet-form';
import { defaultForm, newGroup, type DefenderForm } from './form-state';
import { DefenderPanel } from './DefenderPanel';
import { INTERCESSORS } from './unit-fixtures';

const panel = (defender: DefenderForm, onChange = vi.fn()) => {
  stubFetchRoutes({ 'GET /api/mathhammer/factions': { factions: [] } });
  renderWithProviders(<DefenderPanel defender={defender} onChange={onChange} />);
};

describe('DefenderPanel changes from the datasheet', () => {
  const filled = defenderFrom(INTERCESSORS, 0, [], defaultForm().defender);
  const [row] = filled.groups;
  if (row === undefined) throw new Error('no row');

  it('marks changed model fields and switches, with the datasheet’s values', () => {
    panel({ ...filled, stealth: true, groups: [{ ...row, save: 2 }] });
    const models = within(screen.getByRole('group', { name: 'Models 1' }));
    expect(models.getByLabelText('Sv')).toHaveAttribute('title', 'Datasheet: 3');
    expect(models.getByLabelText('T')).not.toHaveAttribute('data-changed');
    expect(screen.getByLabelText('Stealth')).toHaveAttribute('title', 'Datasheet: off');
  });

  it('puts a changed model row back, and tags rows added by hand', () => {
    const onChange = vi.fn();
    panel(
      {
        ...filled,
        groups: [
          { ...row, save: 2 },
          { ...newGroup(), name: 'Extra' },
        ],
      },
      onChange,
    );
    const models = within(screen.getByRole('group', { name: 'Models 1' }));
    fireEvent.click(models.getByRole('button', { name: 'Reset' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        groups: [expect.objectContaining({ save: 3 }), expect.anything()],
      }),
    );
    expect(
      within(screen.getByRole('group', { name: 'Models 2' })).getByText('Added'),
    ).toBeInTheDocument();
  });

  it('puts the defender’s switches back', () => {
    const onChange = vi.fn();
    panel({ ...filled, stealth: true }, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Reset switches' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ stealth: false }));
  });
});
