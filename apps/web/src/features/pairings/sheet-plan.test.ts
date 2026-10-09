import { parseSheetPaste } from '@bcp/shared';
import { afterEach, describe, expect, it } from 'vitest';
import {
  altPlan,
  planFromPaste,
  ratePlan,
  ratingsFromPaste,
  readPlan,
  savedPlan,
  writePlan,
} from './sheet-plan';

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

  it('keeps what a game can become, through changes of its chip', () => {
    const plan = planFromPaste(parseSheetPaste(SHEET.replace('Y\tY\tR\tG', 'Y, R\tY\tR\tG')));
    if (!plan) throw new Error('no plan');
    expect(plan.ratings).toContainEqual({
      playerId: 'us0',
      opponentPlayerId: 'them1',
      chip: 'Y',
      alt: 'R',
    });
    const changed = ratePlan(plan, 'us0', 'them1', 'G');
    expect(changed.ratings).toContainEqual({
      playerId: 'us0',
      opponentPlayerId: 'them1',
      chip: 'G',
      alt: 'R',
    });
    const plain = altPlan(changed, 'us0', 'them1', null);
    expect(plain.ratings).toContainEqual({ playerId: 'us0', opponentPlayerId: 'them1', chip: 'G' });
  });

  it('a plan from an event is kept per opponent, so going back to one brings its ratings back', () => {
    const plan = planFromPaste(parseSheetPaste(SHEET));
    if (!plan) throw new Error('no plan');
    const first = { ...plan, source: { event: 'E1', team: 'T1', opponent: 'T2' } };
    const second = { ...plan, ratings: [], source: { event: 'E1', team: 'T1', opponent: 'T3' } };
    writePlan(first);
    writePlan(second);
    expect(readPlan()?.source?.opponent).toBe('T3');
    expect(savedPlan({ event: 'E1', team: 'T1', opponent: 'T2' })?.ratings).toHaveLength(23);
    expect(savedPlan({ event: 'E1', team: 'T1', opponent: 'T9' })).toBeNull();
  });

  it('a pasted sheet onto an event’s players: rows and columns matched by army, not position', () => {
    const plan = planFromPaste(parseSheetPaste(SHEET));
    if (!plan) throw new Error('no plan');
    // The event lists the same armies in another order.
    const event = { ...plan, ours: [...plan.ours].reverse(), theirs: [...plan.theirs].reverse() };
    const { ratings, unmatched } = ratingsFromPaste(parseSheetPaste(SHEET), event);
    expect(unmatched).toEqual([]);
    // Space Marines v Grey Knights is GG whatever the order.
    expect(ratings).toContainEqual({ playerId: 'us0', opponentPlayerId: 'them0', chip: 'GG' });
    expect(ratings).toHaveLength(23);
  });

  it('armies the paste can’t match are named, and their games left out', () => {
    const plan = planFromPaste(parseSheetPaste(SHEET));
    if (!plan) throw new Error('no plan');
    const event = {
      ...plan,
      ours: plan.ours.map((p, i) => (i === 0 ? { ...p, faction: 'Necrons' } : p)),
    };
    const { ratings, unmatched } = ratingsFromPaste(parseSheetPaste(SHEET), event);
    expect(unmatched).toEqual(['Space Marines']);
    expect(ratings.some((r) => r.playerId === 'us0')).toBe(false);
  });
});
