import { describe, expect, it } from 'vitest';
import { computeMeta, computeTeamMeta, reliableWinRate, type MetaPlayerRow } from './meta';

const row = (overrides: Partial<MetaPlayerRow> = {}): MetaPlayerRow => ({
  eventId: 'E1',
  isTeamEvent: false,
  eventFinished: true,
  teamId: null,
  teamPlacing: null,
  faction: 'Orks',
  detachments: [],
  disposition: null,
  eventStart: '2026-09-07',
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

  it('gives a reliable win rate: the low end of a 95% range, so few games count for less', () => {
    const lucky = computeMeta(
      Array.from({ length: 12 }, () => row({ faction: 'Orks', wins: 3, losses: 1, draws: 1 })),
    ).factions[0];
    const solid = computeMeta(
      Array.from({ length: 200 }, () => row({ faction: 'Orks', wins: 3, losses: 2, draws: 0 })),
    ).factions[0];
    // 70% from 60 games vs 60% from 1,000: the bigger sample is the more reliable result.
    expect(lucky?.winRate).toBeCloseTo(0.7, 5);
    expect(lucky?.reliableWinRate).toBeCloseTo(0.575, 3);
    expect(solid?.winRate).toBeCloseTo(0.6, 5);
    expect(solid?.reliableWinRate).toBeCloseTo(0.569, 3);
    expect(
      computeMeta([row({ wins: 1, losses: 0, draws: 0 })]).factions[0]?.reliableWinRate,
    ).toBeLessThan(0.5);
  });

  it('counts each archetype’s dispositions, most picked first, unknown ones left out', () => {
    const dispositions = computeMeta([
      row({ detachments: ['War Horde'], disposition: 'Take and Hold' }),
      row({ detachments: ['War Horde'], disposition: 'Purge the Foe' }),
      row({ detachments: ['War Horde'], disposition: 'Take and Hold' }),
      row({ detachments: ['War Horde'], disposition: null }),
    ]).factions[0]?.archetypes[0]?.dispositions;
    expect(dispositions).toEqual([
      { name: 'Take and Hold', players: 2 },
      { name: 'Purge the Foe', players: 1 },
    ]);
  });

  it('follows each faction’s and archetype’s share week by week (weeks start on Monday)', () => {
    const weekly = computeMeta([
      row({ eventStart: '2026-09-07', detachments: ['War Horde'] }),
      row({ eventStart: '2026-09-09', faction: 'Necrons' }),
      row({ eventStart: '2026-09-26', detachments: ['War Horde'] }),
    ]);
    // 14 Sep had no events: no share that week, not 0.
    expect(weekly.weeks).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
    const orks = weekly.factions.find((f) => f.faction === 'Orks');
    expect(orks?.trend).toEqual([0.5, null, 1]);
    expect(orks?.archetypes[0]?.trend).toEqual([0.5, null, 1]);
    expect(weekly.factions.find((f) => f.faction === 'Necrons')?.trend).toEqual([0.5, null, 0]);
  });

  it('gives the change in reliable win rate: the last 30 days against the 30 before', () => {
    const recent = [row({ detachments: ['War Horde'] }), row({ faction: 'Necrons' })];
    const prior = [row({ detachments: ['War Horde'], wins: 1, losses: 4, draws: 0 })];
    const compared = computeMeta([...recent, ...prior], { recent, prior });
    const orks = compared.factions.find((f) => f.faction === 'Orks');
    const expected = reliableWinRate(3.5, 5) - reliableWinRate(1, 5);
    expect(orks?.archetypes[0]?.change).toBeCloseTo(expected, 6);
    // Orks as a whole: the same two players.
    expect(orks?.change).toBeCloseTo(expected, 6);
    // Necrons weren't played in the 30 days before: no change to show.
    expect(compared.factions.find((f) => f.faction === 'Necrons')?.change).toBeNull();
  });

  it('treats the same detachments in another order as one archetype', () => {
    const result = computeMeta([
      row({ faction: 'Adeptus Custodes', detachments: ['Shield Host', 'Tharanatoi Hammerblow'] }),
      row({ faction: 'Adeptus Custodes', detachments: ['Tharanatoi Hammerblow', 'Shield Host'] }),
    ]);
    expect(result.factions[0]?.archetypes).toMatchObject([
      { detachments: ['Shield Host', 'Tharanatoi Hammerblow'], players: 2 },
    ]);
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

  it('keeps only the top team of a 3-team event', () => {
    const result = computeTeamMeta(teamEvent('A', 3, (p) => (p === 1 ? 'Orks' : 'Necrons')));
    expect(result?.rows.find((r) => r.faction === 'Orks')).toMatchObject({
      topSlots: 2,
      topShare: 1,
    });
    expect(result?.rows.find((r) => r.faction === 'Necrons')?.topSlots).toBe(0);
  });

  it('leaves out team events that haven’t finished, even with placings', () => {
    const running = teamEvent('A', 8, () => 'Orks').map((r) => ({ ...r, eventFinished: false }));
    expect(computeTeamMeta(running)).toBeNull();
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
