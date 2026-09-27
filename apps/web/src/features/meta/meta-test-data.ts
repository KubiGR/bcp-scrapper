import type { MetaResponse, MetaRow, TeamMetaRow } from '@bcp/shared';

export const orks: MetaRow = {
  faction: 'Orks',
  players: 20,
  share: 0.2,
  games: 100,
  winRate: 0.58,
  x1: 6,
  x1Share: 0.3,
  archetypes: [
    {
      detachments: ['Kult of Speed', 'Wreckas'],
      players: 12,
      share: 0.12,
      games: 60,
      winRate: 0.6,
      x1: 4,
      x1Share: 1 / 3,
    },
    { detachments: null, players: 8, share: 0.08, games: 40, winRate: 0.55, x1: 2, x1Share: 0.25 },
  ],
};
export const necrons: MetaRow = {
  faction: 'Necrons',
  players: 10,
  share: 0.1,
  games: 50,
  winRate: 0.4,
  x1: 1,
  x1Share: 0.1,
  archetypes: [
    {
      detachments: ['Hypercrypt Legion'],
      players: 10,
      share: 0.1,
      games: 50,
      winRate: 0.4,
      x1: 1,
      x1Share: 0.1,
    },
  ],
};
export const tiny: MetaRow = {
  faction: 'Grey Knights',
  players: 2,
  share: 0.02,
  games: 10,
  winRate: 0.9,
  x1: 2,
  x1Share: 1,
  archetypes: [],
};
export const unknown: MetaRow = { ...tiny, faction: null, winRate: 0.5 };

export const custodesTeams: TeamMetaRow = {
  faction: 'Adeptus Custodes',
  topSlots: 9,
  topShare: 0.09,
  allSlots: 24,
  allShare: 0.06,
  difference: 0.03,
  archetypes: [],
};

export const metaResponse = (overrides: Partial<MetaResponse> = {}): MetaResponse => ({
  factions: [orks, necrons, tiny, unknown],
  teams: [custodesTeams],
  totals: { players: 100, games: 500 },
  eventsInRange: 5,
  eventsLoaded: 3,
  teamEventsCounted: 2,
  ...overrides,
});
