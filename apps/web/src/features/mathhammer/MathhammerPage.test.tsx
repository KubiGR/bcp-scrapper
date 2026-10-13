import { calculate, type MathhammerList } from '@bcp/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { CAPTAIN, INTERCESSORS } from './unit-fixtures';
import { defaultForm, toCalculation } from './form-state';
import { MathhammerPage } from './MathhammerPage';
import { percent } from './ResultPanel';
import { expected } from './expected';

/** The engine's average models slain for a form, as the page shows it. */
function expectedSlain(change: (form: ReturnType<typeof defaultForm>) => void): string {
  const form = defaultForm();
  change(form);
  const read = toCalculation(form);
  if (!('calculation' in read)) throw new Error(read.error);
  return calculate(read.calculation).averages.modelsSlain.toFixed(2);
}

const weapon = () => within(screen.getByRole('group', { name: 'Weapon 1' }));
/** Opens a step: the page shows one at a time. */
const goTo = (step: 'Attacker' | 'Defender' | 'Result') => {
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(step) }));
};
/** The result's headline, pinned under the attacker and defender steps. */
const summary = () => screen.getByRole('region', { name: 'Result summary' });

describe('MathhammerPage', () => {
  it('shows the result of the starting setup', () => {
    renderWithProviders(<MathhammerPage />);
    goTo('Result');
    expect(screen.getByLabelText('Models slain')).toHaveTextContent(expectedSlain(() => undefined));
    expect(screen.getByRole('table', { name: 'Models slain, at least' })).toBeInTheDocument();
  });

  it('leads with the median, a whole number of models, with the average and the most likely', () => {
    renderWithProviders(<MathhammerPage />);
    goTo('Result');
    const read = toCalculation(defaultForm());
    if (!('calculation' in read)) throw new Error(read.error);
    const { modelsSlain, averages } = calculate(read.calculation);
    const want = expected(modelsSlain);
    const slain = screen.getByLabelText('Models slain');
    expect(within(slain).getByText(String(want.median))).toBeInTheDocument();
    expect(slain).toHaveTextContent(`average ${averages.modelsSlain.toFixed(2)}`);
    expect(slain).toHaveTextContent(`most likely ${String(want.mode)}`);
  });

  it('hides weapons not used in the phase behind one line, and shows them on request', () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.click(screen.getByRole('radio', { name: 'Fighting' }));
    expect(screen.queryByRole('group', { name: 'Weapon 1' })).toBeNull();
    expect(screen.getByText('Not used when fighting: Bolt rifle')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByRole('group', { name: 'Weapon 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByRole('group', { name: 'Weapon 1' })).toBeNull();
  });

  it('offers to share the result as an image', () => {
    renderWithProviders(<MathhammerPage />);
    goTo('Result');
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByTestId('share-card')).toBeInTheDocument();
  });

  it('charts the chance of each total of damage dealt', () => {
    renderWithProviders(<MathhammerPage />);
    goTo('Result');
    expect(screen.getByRole('img', { name: /^Damage dealt: / })).toBeInTheDocument();
  });

  it('leaves out totals of models slain with less than a 1% chance', () => {
    renderWithProviders(<MathhammerPage />);
    goTo('Result');
    const table = within(screen.getByRole('table', { name: 'Models slain, at least' }));
    expect(table.queryByText('<1%')).toBeNull();
    const last = table.getAllByRole('row').at(-1)?.textContent ?? '';
    expect(Number(/(\d+)%/.exec(last)?.[1])).toBeGreaterThanOrEqual(1);
  });

  it('shows each weapon step by step under the result', () => {
    renderWithProviders(<MathhammerPage />);
    goTo('Result');
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
      expect(summary()).toHaveTextContent(`Models slain ${want}`);
    });
  });

  it('waits for a number while a minus sign is typed', async () => {
    renderWithProviders(<MathhammerPage />);
    const ap = weapon().getByLabelText('AP');
    fireEvent.change(ap, { target: { value: '-' } });
    expect(ap).toHaveValue('-');
    await waitFor(() => {
      expect(summary()).toHaveTextContent(`Models slain ${expectedSlain(() => undefined)}`);
    });
    fireEvent.change(ap, { target: { value: '-2' } });
    const want = expectedSlain((form) => {
      const first = form.weapons[0];
      if (first !== undefined) form.weapons = [{ ...first, ap: -2 }];
    });
    await waitFor(() => {
      expect(summary()).toHaveTextContent(`Models slain ${want}`);
    });
  });

  it('keeps typed numbers within the field’s limits', async () => {
    renderWithProviders(<MathhammerPage />);
    goTo('Defender');
    const models = within(screen.getByRole('group', { name: 'Models 1' }));
    fireEvent.change(models.getByLabelText('Sv'), { target: { value: '1' } });
    const want = expectedSlain((form) => {
      const first = form.defender.groups[0];
      if (first !== undefined) form.defender.groups = [{ ...first, save: 2 }];
    });
    await waitFor(() => {
      expect(summary()).toHaveTextContent(`Models slain ${want}`);
    });
  });

  it('applies the situation (the target starts in cover; unticking it removes cover)', async () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.click(screen.getByLabelText('In cover (-1 BS for ranged)'));
    const want = expectedSlain((form) => {
      form.situation = { ...form.situation, cover: false };
    });
    await waitFor(() => {
      expect(summary()).toHaveTextContent(`Models slain ${want}`);
    });
  });

  it('says what it can’t read', async () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.change(weapon().getByLabelText('D'), { target: { value: 'D7' } });
    goTo('Result');
    const result = within(screen.getByRole('region', { name: 'Full result' }));
    expect(await result.findByText('Can’t calculate')).toBeInTheDocument();
    expect(result.getByText(/Bolt rifle damage: can’t read “D7”/)).toBeInTheDocument();
  });

  it('shows the leader’s chance once a Character is added', async () => {
    renderWithProviders(<MathhammerPage />);
    goTo('Defender');
    fireEvent.click(screen.getByRole('button', { name: 'Add models' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Models 2' })).getByLabelText('Character'),
    );
    goTo('Result');
    const result = within(screen.getByRole('region', { name: 'Full result' }));
    expect(await result.findByText('Leader slain')).toBeInTheDocument();
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
    // A list read is remembered in the browser; each test starts without one.
    localStorage.clear();
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
    expect(weapon().getByLabelText('Weapons')).toHaveValue('5');
    const plasma = within(screen.getByRole('group', { name: 'Weapon 2' }));
    expect(plasma.getByRole('combobox', { name: 'Profile' })).toHaveValue('Best');
    expect(await plasma.findByText(/^Best here: /)).toBeInTheDocument();
    // The Captain's melee weapon sits out while shooting: shown on request.
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
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
    expect(weapon().getByLabelText('Weapons')).toHaveValue('5');
    // The Captain's melee weapon sits out while shooting: shown on request.
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    const captain = within(screen.getByRole('group', { name: 'Weapon 2' }));
    expect(captain.getByLabelText('Weapon')).toHaveValue('Captain: Master-crafted power weapon');
  });

  it('fills the defender from a pasted list unit, the character as its own row', async () => {
    stubFetchRoutes(listRoutes);
    renderWithProviders(<MathhammerPage />);
    goTo('Defender');
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

describe('MathhammerPage steps', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('starts on the attacker, one step at a time', () => {
    renderWithProviders(<MathhammerPage />);
    expect(screen.getByRole('tab', { name: /Attacker/, selected: true })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Weapon 1' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Models 1' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Full result' })).toBeNull();
  });

  it('walks attacker, defender, result with Next and back again', () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.click(screen.getByRole('button', { name: /Next: Defender/ }));
    expect(screen.getByRole('group', { name: 'Models 1' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Weapon 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Next: Result/ }));
    expect(screen.getByRole('region', { name: 'Full result' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back: Defender/ }));
    expect(screen.getByRole('group', { name: 'Models 1' })).toBeInTheDocument();
  });

  it('jumps to a step from its tab', () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.click(screen.getByRole('tab', { name: /Result/ }));
    expect(screen.getByRole('region', { name: 'Full result' })).toBeInTheDocument();
  });

  it('keeps the result summary on the other steps, opening the result from it', () => {
    renderWithProviders(<MathhammerPage />);
    expect(screen.getByRole('region', { name: 'Result summary' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Full result' }));
    expect(screen.getByRole('region', { name: 'Full result' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Result summary' })).toBeNull();
  });

  it('shows no stray code comments as text', () => {
    renderWithProviders(<MathhammerPage />);
    expect(screen.queryByText(/^\s*\/\//)).toBeNull();
  });

  it('has no other layout to switch to', () => {
    renderWithProviders(<MathhammerPage />);
    expect(screen.queryByRole('radio', { name: 'Side by side' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Steps' })).toBeNull();
  });
});
