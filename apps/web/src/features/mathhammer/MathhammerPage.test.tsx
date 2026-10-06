import { calculate, type MathhammerList } from '@bcp/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { CAPTAIN, INTERCESSORS } from './unit-fixtures';
import { defaultForm, toCalculation } from './form-state';
import { MathhammerPage } from './MathhammerPage';
import { percent } from './ResultPanel';

/** The engine's average models slain for a form, as the page shows it. */
function expectedSlain(change: (form: ReturnType<typeof defaultForm>) => void): string {
  const form = defaultForm();
  change(form);
  const read = toCalculation(form);
  if (!('calculation' in read)) throw new Error(read.error);
  return calculate(read.calculation).averages.modelsSlain.toFixed(2);
}

const weapon = () => within(screen.getByRole('group', { name: 'Weapon 1' }));

describe('MathhammerPage', () => {
  it('shows the result of the starting setup', () => {
    renderWithProviders(<MathhammerPage />);
    expect(screen.getByLabelText('Models slain')).toHaveTextContent(expectedSlain(() => undefined));
    expect(screen.getByRole('table', { name: 'Models slain, at least' })).toBeInTheDocument();
  });

  it('shows each weapon step by step under the result', () => {
    renderWithProviders(<MathhammerPage />);
    const steps = within(screen.getByRole('table', { name: 'Step by step' }));
    expect(steps.getAllByRole('rowheader').length).toBeGreaterThan(0);
  });

  it('recalculates when a weapon changes', async () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.change(weapon().getByLabelText('Attacks'), { target: { value: '4' } });
    const want = expectedSlain((form) => {
      const first = form.weapons[0];
      if (first !== undefined) form.weapons = [{ ...first, attacks: '4' }];
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Models slain')).toHaveTextContent(want);
    });
  });

  it('waits for a number while a minus sign is typed', async () => {
    renderWithProviders(<MathhammerPage />);
    const ap = weapon().getByLabelText('AP');
    fireEvent.change(ap, { target: { value: '-' } });
    expect(ap).toHaveValue('-');
    await waitFor(() => {
      expect(screen.getByLabelText('Models slain')).toHaveTextContent(
        expectedSlain(() => undefined),
      );
    });
    fireEvent.change(ap, { target: { value: '-2' } });
    const want = expectedSlain((form) => {
      const first = form.weapons[0];
      if (first !== undefined) form.weapons = [{ ...first, ap: -2 }];
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Models slain')).toHaveTextContent(want);
    });
  });

  it('keeps typed numbers within the field’s limits', async () => {
    renderWithProviders(<MathhammerPage />);
    const models = within(screen.getByRole('group', { name: 'Models 1' }));
    fireEvent.change(models.getByLabelText('Sv'), { target: { value: '1' } });
    const want = expectedSlain((form) => {
      const first = form.defender.groups[0];
      if (first !== undefined) form.defender.groups = [{ ...first, save: 2 }];
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Models slain')).toHaveTextContent(want);
    });
  });

  it('applies the situation', async () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.click(screen.getByLabelText('In cover (-1 BS for ranged)'));
    const want = expectedSlain((form) => {
      form.situation = { ...form.situation, cover: true };
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Models slain')).toHaveTextContent(want);
    });
  });

  it('says what it can’t read', async () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.change(weapon().getByLabelText('D'), { target: { value: 'D7' } });
    expect(await screen.findByText('Can’t calculate')).toBeInTheDocument();
    expect(screen.getByText(/Bolt rifle damage: can’t read “D7”/)).toBeInTheDocument();
  });

  it('shows the leader’s chance once a Character is added', async () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Add models' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Models 2' })).getByLabelText('Character'),
    );
    expect(await screen.findByText('Leader slain')).toBeInTheDocument();
    expect(screen.getByText(/^Allocation: /)).toBeInTheDocument();
  });
});

describe('percent', () => {
  it('never rounds a real chance to 0% or 100%', () => {
    expect(percent(0.623)).toBe('62%');
    expect(percent(0.001)).toBe('<1%');
    expect(percent(0.999)).toBe('>99%');
    expect(percent(1)).toBe('100%');
    expect(percent(0)).toBe('0%');
  });
});

describe('picking units', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const choose = async (label: string, option: string) => {
    fireEvent.click(await screen.findByRole('combobox', { name: label }));
    fireEvent.click(await screen.findByRole('option', { name: option }));
  };

  it('fills the attacker from a datasheet with an attached leader', async () => {
    stubFetchRoutes({
      'GET /api/mathhammer/factions': {
        factions: [{ faction: 'Space Marines (Astartes)', units: 2 }],
      },
      'GET /api/mathhammer/units': {
        faction: 'Space Marines (Astartes)',
        datasheets: [CAPTAIN, INTERCESSORS],
      },
    });
    renderWithProviders(<MathhammerPage />);
    await choose('Attacker faction', 'Space Marines (Astartes)');
    await choose('Attacker unit', 'Intercessor Squad');
    await choose('Attached characters', 'Captain');
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(
      await screen.findByText('From datasheet: Intercessor Squad + Captain'),
    ).toBeInTheDocument();
    expect(weapon().getByLabelText('Weapon')).toHaveValue('Bolt rifle');
    expect(weapon().getByLabelText('Models')).toHaveValue('5');
    const plasma = within(screen.getByRole('group', { name: 'Weapon 2' }));
    expect(plasma.getByRole('combobox', { name: 'Profile' })).toHaveValue('Best');
    expect(await plasma.findByText(/^Best here: /)).toBeInTheDocument();
    const captain = within(screen.getByRole('group', { name: 'Weapon 3' }));
    expect(captain.getByLabelText('Weapon')).toHaveValue('Captain: Master-crafted power weapon');
  });

  /** Intercessor Squad ×5 (bolt rifles), led by a Captain. */
  const LIST: MathhammerList = {
    army: 'Space Marines (Astartes)',
    datasheets: [INTERCESSORS, CAPTAIN],
    units: [
      {
        label: 'Captain',
        name: 'Captain',
        datasheetId: CAPTAIN.id,
        attachedTo: 1,
        unread: [],
        groups: [{ modelId: 'm-cap', models: 1, weapons: [{ weaponId: 'wi-mc', count: 1 }] }],
      },
      {
        label: 'Intercessor Squad ×5',
        name: 'Intercessor Squad',
        datasheetId: INTERCESSORS.id,
        attachedTo: null,
        unread: [],
        groups: [
          { modelId: 'm-sgt', models: 1, weapons: [{ weaponId: 'wi-br', count: 1 }] },
          { modelId: 'm-int', models: 4, weapons: [{ weaponId: 'wi-br', count: 4 }] },
        ],
      },
    ],
  };
  const listRoutes = {
    'GET /api/mathhammer/factions': {
      factions: [{ faction: 'Space Marines (Astartes)', units: 2 }],
    },
    'POST /api/mathhammer/list': LIST,
  };
  const pasteAndUse = async (side: 'Attacker' | 'Defender') => {
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: `${side} source` })).getByRole('radio', {
        name: 'From a list',
      }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: `${side} list` }), {
      target: { value: 'list' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read list' }));
    await choose(`${side} list unit`, 'Intercessor Squad ×5 + Captain');
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
  };

  it('fills the attacker from a pasted list unit, its attached character’s weapons included', async () => {
    stubFetchRoutes(listRoutes);
    renderWithProviders(<MathhammerPage />);
    await pasteAndUse('Attacker');
    expect(
      await screen.findByText('From datasheet: Intercessor Squad + Captain'),
    ).toBeInTheDocument();
    expect(weapon().getByLabelText('Weapon')).toHaveValue('Bolt rifle');
    expect(weapon().getByLabelText('Models')).toHaveValue('5');
    const captain = within(screen.getByRole('group', { name: 'Weapon 2' }));
    expect(captain.getByLabelText('Weapon')).toHaveValue('Captain: Master-crafted power weapon');
  });

  it('fills the defender from a pasted list unit, the character as its own row', async () => {
    stubFetchRoutes(listRoutes);
    renderWithProviders(<MathhammerPage />);
    await pasteAndUse('Defender');
    expect(
      await screen.findByText('From datasheet: Intercessor Squad + Captain'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Models 1' })).getByLabelText('How many'),
    ).toHaveValue('5');
    expect(
      within(screen.getByRole('group', { name: 'Models 2' })).getByLabelText('Character'),
    ).toBeChecked();
  });

  it('says when the unit data hasn’t been read', async () => {
    stubFetchRoutes({
      'GET /api/mathhammer/factions': () =>
        Response.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'The unit data from 39k.pro hasn’t been read yet: refresh it in Settings',
            },
          },
          { status: 404 },
        ),
    });
    renderWithProviders(<MathhammerPage />);
    expect((await screen.findAllByText(/refresh it in Settings/)).length).toBeGreaterThan(0);
  });
});
