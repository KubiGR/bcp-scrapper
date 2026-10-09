import type { EventPlayer } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import { planFromEvent, teamsOf } from './event-plan';

const player = (
  bcpId: string,
  teamId: string,
  faction: string,
  extra: Partial<EventPlayer> = {},
) => ({
  bcpId,
  name: `Player ${bcpId}`,
  bcpUserId: null,
  teamName: teamId === 'T1' ? 'Dice Bunker' : 'Mighty Ducks',
  teamId,
  teamPlacing: null,
  faction,
  factionGuessed: false,
  parentFaction: null,
  placing: null,
  wins: 0,
  losses: 0,
  draws: 0,
  dropped: false,
  disposition: 'Take and Hold',
  detachments: ['Some Detachment'],
  listStatus: 'fetched' as const,
  listError: null,
  listErrorCode: null,
  ...extra,
});

const players = [
  ...[
    'Space Marines',
    'World Eaters',
    'Chaos Daemons',
    "Emperor's Children",
    'Adepta Sororitas',
  ].map((f, i) => player(`U${String(i)}`, 'T1', f)),
  ...['Grey Knights', 'Death Guard', 'Orks', 'Chaos Space Marines', 'Adeptus Custodes'].map(
    (f, i) => player(`O${String(i)}`, 'T2', f, { disposition: i === 0 ? 'Disruption' : null }),
  ),
  player('X', 'T2', 'Necrons', { dropped: true }),
];

describe('event plans', () => {
  it('the teams of an event, with how many players are still in', () => {
    expect(teamsOf(players)).toEqual([
      { id: 'T1', name: 'Dice Bunker', players: 5 },
      { id: 'T2', name: 'Mighty Ducks', players: 5 },
    ]);
  });

  it('both teams as the planner’s players: army, detachments, disposition and the short list', () => {
    const lists = new Map([['O0', 'Castellan Crowe (90 Points)\n\nPurifier Squad x10 (240 pts)']]);
    const plan = planFromEvent(players, lists, 'T1', 'T2', 'E1');
    expect(plan.ours.map((p) => p.faction)).toEqual([
      'Space Marines',
      'World Eaters',
      'Chaos Daemons',
      "Emperor's Children",
      'Adepta Sororitas',
    ]);
    expect(plan.theirs[0]).toEqual({
      id: 'O0',
      name: 'Player O0',
      faction: 'Grey Knights',
      detachments: ['Some Detachment'],
      disposition: 'Disruption',
      list: 'Castellan Crowe\n10 Purifier Squad',
    });
    expect(plan.theirs[1]?.list).toBeNull();
    expect(plan.ratings).toEqual([]);
    expect(plan.source).toEqual({ event: 'E1', team: 'T1', opponent: 'T2' });
  });
});
