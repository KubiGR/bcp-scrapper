import { parseSheetPaste } from '@bcp/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { planFromPaste, ratePlan, readPlan, writePlan } from './sheet-plan';

const SHEET = [
  '\tGrey Knights\tDeath Guard\tOrks\tChaos Space Marines\tAdeptus Custodes',
  'Space Marines\tGG\tY\tY\tR\tG',
  'Emperor’s Children\tY\tG, A\tRR\tG\tG',
  'Chaos Daemons\tR\tG\tY\tR\tgreat',
  'World Eaters\tG\tY\tR\tG\tG',
  'Adepta Sororitas\tG\tR\t\tRR\tG',
].join('\n');

afterEach(() => {
  localStorage.clear();
});

describe('the sheet plan', () => {
  it('turns a paste into players and ratings, leaving blank and unreadable cells unrated', () => {
    const plan = planFromPaste(parseSheetPaste(SHEET));
    expect(plan?.ours.map((p) => p.faction)).toEqual([
      'Space Marines',
      'Emperor’s Children',
      'Chaos Daemons',
      'World Eaters',
      'Adepta Sororitas',
    ]);
    expect(plan?.theirs[3]?.faction).toBe('Chaos Space Marines');
    expect(plan?.ratings).toHaveLength(23);
    expect(plan?.ratings).toContainEqual({ playerId: 'us1', opponentPlayerId: 'them1', chip: 'G' });
  });

  it('a paste without ratings makes no plan', () => {
    expect(planFromPaste(parseSheetPaste('hello\tworld'))).toBeNull();
  });

  it('a changed chip replaces the old one, and clearing removes it', () => {
    const plan = planFromPaste(parseSheetPaste(SHEET));
    if (!plan) throw new Error('no plan');
    const changed = ratePlan(plan, 'us0', 'them0', 'RR');
    expect(changed.ratings).toContainEqual({
      playerId: 'us0',
      opponentPlayerId: 'them0',
      chip: 'RR',
    });
    expect(changed.ratings).toHaveLength(23);
    expect(ratePlan(changed, 'us0', 'them0', null).ratings).toHaveLength(22);
  });

  it('is kept in this browser, and anything unreadable there is ignored', () => {
    const plan = planFromPaste(parseSheetPaste(SHEET));
    if (!plan) throw new Error('no plan');
    writePlan(plan);
    expect(readPlan()).toEqual(plan);
    localStorage.setItem('pairings:sheet-plan', '{"ours":1}');
    expect(readPlan()).toBeNull();
  });
});
