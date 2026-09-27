import { describe, expect, it } from 'vitest';
import { computeMeta, computeTeamMeta, type MetaPlayerRow } from './meta';

const row = (overrides: Partial<MetaPlayerRow> = {}): MetaPlayerRow => ({
  eventId: 'E1',
  isTeamEvent: false,
  teamId: null,
  teamPlacing: null,
  faction: 'Orks',
  detachments: [],
  wins: 3,
  losses: 1,
  draws: 1,
  ...overrides,
});

describe('computeMeta', () => {
  const rows = [
    row({ faction: 'Orks', detachments: ['War Horde'], wins: 3, losses: 1, draws: 1 }),
    row({
      faction: 'Orks',
      detachments: ['Kult of Speed', 'Wreckas'],
      wins: 5,
      losses: 0,
      draws: 0,
    }),
    row({ faction: 'Necrons', detachments: [], wins: 0, losses: 5, draws: 0 }),
    row({ faction: null, wins: 1, losses: 1, draws: 0 }),
    row({ faction: 'Orks', wins: 0, losses: 0, draws: 0 }), // no games: ignored
  ];
  const meta = computeMeta(rows);

  it('counts players, share, win rate (draws half) and X-1 per faction', () => {
    expect(meta.totals).toEqual({ players: 4, games: 17 });
    const orks = meta.factions[0];
    expect(orks).toMatchObject({
      faction: 'Orks',
      players: 2,
      share: 0.5,
      games: 10,
      x1: 2,
      x1Share: 1,
    });
    expect(orks?.winRate).toBeCloseTo(0.85);
    expect(meta.factions.find((f) => f.faction === 'Necrons')).toMatchObject({ x1: 0, winRate: 0 });
  });

  it('puts the Unknown faction last', () => {
    expect(meta.factions.map((f) => f.faction)).toEqual(['Orks', 'Necrons', null]);
  });

  it('splits a faction into archetypes, Detachment unknown last', () => {
    expect(meta.factions[0]?.archetypes.map((a) => [a.detachments, a.share])).toEqual([
      [['Kult of Speed', 'Wreckas'], 0.25],
      [['War Horde'], 0.25],
    ]);
    expect(meta.factions[1]?.archetypes).toMatchObject([{ detachments: null, players: 1 }]);
  });
});

describe('computeTeamMeta', () => {
  /** An event of `teams` teams (placed 1..n unless given), two players each. */
  function teamEvent(
    eventId: string,
    teams: number,
    factionOf: (placing: number) => string,
    placings?: (number | null)[],
  ) {
    return Array.from({ length: teams }, (_, i) => {
      const placing = placings ? (placings[i] ?? null) : i + 1;
      return [0, 1].map(() =>
        row({
          eventId,
          isTeamEvent: true,
          teamId: `${eventId}-T${i}`,
          teamPlacing: placing,
          faction: factionOf(i + 1),
        }),
      );
    }).flat();
  }

  it('compares top-25% teams with all teams, per event', () => {
    const rows = [
      ...teamEvent('A', 8, (p) => (p <= 2 ? 'Adeptus Custodes' : 'Orks')), // top 2 of 8
      ...teamEvent('B', 7, (p) => (p <= 2 ? 'Adeptus Custodes' : 'Necrons')), // top 2 of 7
      ...teamEvent('C', 4, () => 'Orks', [1, 2, null, 4]), // a team without placing: left out
      row({ eventId: 'S', faction: 'Tyranids' }), // singles: ignored
    ];
    const result = computeTeamMeta(rows);
    expect(result?.eventsCounted).toBe(2);
    const custodes = result?.rows[0];
    expect(custodes).toMatchObject({
      faction: 'Adeptus Custodes',
      topSlots: 8,
      allSlots: 8,
      topShare: 1,
    });
    expect(custodes?.allShare).toBeCloseTo(8 / 30);
    expect(custodes?.difference).toBeCloseTo(1 - 8 / 30);
    expect(result?.rows.map((r) => r.faction)).toEqual(['Adeptus Custodes', 'Necrons', 'Orks']);
    expect(result?.rows.every((r) => Number.isFinite(r.difference))).toBe(true);
  });

  it('treats the only team of a one-team event as a top team', () => {
    const result = computeTeamMeta(teamEvent('A', 1, () => 'Orks'));
    expect(result?.rows).toMatchObject([
      { faction: 'Orks', topSlots: 2, allSlots: 2, topShare: 1, allShare: 1, difference: 0 },
    ]);
  });

  it('is null without a team event that has placings', () => {
    expect(computeTeamMeta([row()])).toBeNull();
    expect(computeTeamMeta(teamEvent('A', 2, () => 'Orks', [null, null]))).toBeNull();
  });
});
