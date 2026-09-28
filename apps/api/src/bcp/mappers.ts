import type {
  ArmyList,
  EventSummary,
  Game,
  GameResult,
  Player,
  Side,
  Team,
  TeamMatchup,
} from '@bcp/shared';
import {
  toNumberOrNull,
  type RawArmyList,
  type RawEventDetail,
  type RawEventGame,
  type RawEventSearchItem,
  type RawGameSummary,
  type RawPairing,
  type RawPlayer,
  type RawTeam,
  type RawTeamPairing,
} from './raw';

/** BCP's numeric game results. */
const BCP_WIN = 2;
const BCP_DRAW = 1;
const BCP_LOSS = 0;

const toIso = (value: string): string => new Date(value).toISOString();

export function mapEventSearchItem(raw: RawEventSearchItem): EventSummary {
  const isTeamEvent = raw.teamEvent ?? false;
  const city = raw.city?.trim();
  return {
    bcpId: raw.id,
    name: raw.name.trim(),
    startDate: toIso(raw.eventDate),
    endDate: raw.eventEndDate ? toIso(raw.eventEndDate) : null,
    country: raw.country ?? null,
    city: city === undefined || city === '' ? null : city, // event detail may still know better
    playerCount: raw.totalPlayers ?? 0,
    teamCount: isTeamEvent && raw.totalTeamPlayers ? raw.totalTeamPlayers : null,
    isTeamEvent,
    isOnline: raw.isOnlineEvent ?? false,
    roundCount: raw.numberOfRounds ?? 0,
    ended: raw.ended ?? false,
    hideLists: raw.hideLists ?? false,
  };
}

export function mapEventDetail(raw: RawEventDetail): EventSummary {
  const isTeamEvent = raw.format?.teamEvent ?? false;
  return {
    bcpId: raw.id,
    name: raw.name.trim(),
    startDate: toIso(raw.dates.start),
    endDate: raw.dates.end ? toIso(raw.dates.end) : null,
    country: raw.location?.country ?? null,
    city: raw.location?.city ?? null,
    playerCount: raw.playerCounts?.total ?? 0,
    teamCount: isTeamEvent ? (raw.teamPlayerCounts?.total ?? null) : null,
    isTeamEvent,
    isOnline: raw.isOnlineEvent ?? false,
    roundCount: raw.status?.numberOfRounds ?? 0,
    ended: raw.status?.ended ?? false,
    hideLists: raw.flags?.hideLists ?? false,
  };
}

function tallyRecord(games: RawGameSummary[] | null | undefined) {
  const record = { wins: 0, losses: 0, draws: 0 };
  for (const game of games ?? []) {
    if (game.gameResult === BCP_WIN) record.wins += 1;
    else if (game.gameResult === BCP_DRAW) record.draws += 1;
    else if (game.gameResult === BCP_LOSS) record.losses += 1;
  }
  return record;
}

export function mapPlayer(raw: RawPlayer, eventId: string): Player {
  const name = [raw.user?.firstName, raw.user?.lastName].filter(Boolean).join(' ').trim();
  const disposition = raw.subFaction?.name?.trim() ?? '';
  return {
    bcpId: raw.id,
    eventBcpId: eventId,
    teamBcpId: raw.teamPlayerId ?? null,
    name: name || 'Unknown player',
    faction: raw.faction?.name ?? null,
    parentFaction: raw.faction?.parentFaction?.name ?? null,
    placing: raw.placing ?? null,
    ...tallyRecord(raw.total_games),
    dropped: raw.dropped ?? false,
    listBcpId: raw.listId ?? null,
    disposition: disposition === '' ? null : disposition,
  };
}

/** Swiss games are stage 0 and bracket (pod) games stage 1, so pods sort after the swiss rounds. */
const stageOf = (game: RawGameSummary) => (game.pod ? 1 : 0);

export function mapTeam(raw: RawTeam, eventId: string): Team {
  const games = [...(raw.total_games ?? [])].sort(
    (a, b) => stageOf(a) - stageOf(b) || a.gameNum - b.gameNum,
  );
  return {
    bcpId: raw.id,
    eventBcpId: eventId,
    name: raw.name.trim(),
    placing: raw.placing ?? null,
    roundPoints: games.map((game) => game.gamePoints ?? 0),
  };
}

export function mapTeamPairing(raw: RawTeamPairing, eventId: string): TeamMatchup | null {
  if (!raw.teamPlayer1) return null;
  return {
    bcpId: raw.id,
    eventBcpId: eventId,
    round: raw.round,
    tableNo: raw.table ?? null,
    teamABcpId: raw.teamPlayer1.id,
    teamBBcpId: raw.teamPlayer2?.id ?? null,
    pointsA: raw.player1Game?.points ?? null,
    pointsB: raw.player2Game?.points ?? null,
  };
}

export function toGameResult(a: number | null, b: number | null): GameResult | null {
  if (a === BCP_WIN) return 'a_win';
  if (b === BCP_WIN) return 'b_win';
  if (a === BCP_DRAW && b === BCP_DRAW) return 'draw';
  return null;
}

function firstTurn(meta: Record<string, unknown>): Side | null {
  if (meta['p1-firstTurn'] === true) return 'a';
  if (meta['p2-firstTurn'] === true) return 'b';
  return null;
}

export function mapPairing(raw: RawPairing, eventId: string): Game | null {
  if (!raw.player1) return null;
  const meta = raw.metaData ?? {};
  const stat = (player: 1 | 2, name: string) => toNumberOrNull(meta[`p${player}-${name}`]);
  return {
    bcpId: raw.id,
    eventBcpId: eventId,
    round: raw.round,
    tableNo: raw.table ?? null,
    teamMatchupBcpId: raw.teamPairingId ?? null,
    playerABcpId: raw.player1.id,
    playerBBcpId: raw.player2?.id ?? null,
    vpA: stat(1, 'victoryPoints'),
    vpB: stat(2, 'victoryPoints'),
    primaryA: stat(1, 'primary'),
    primaryB: stat(2, 'primary'),
    secondaryA: stat(1, 'secondary'),
    secondaryB: stat(2, 'secondary'),
    gamePointsA: stat(1, 'gamePoints'),
    gamePointsB: stat(2, 'gamePoints'),
    firstTurn: firstTurn(meta),
    result: toGameResult(stat(1, 'gameResult'), stat(2, 'gameResult')),
  };
}

/**
 * A game from the event-level endpoint (bracket/GW team events). It carries each side's result
 * and game points but no VP, primary, secondary or first turn. A game without player 2 is a
 * bye, which BCP scores as a win for player 1. `round` is the round being synced, used when the
 * raw game doesn't carry its own (which happens occasionally).
 */
export function mapEventGame(raw: RawEventGame, eventId: string, round: number): Game | null {
  if (!raw.player1) return null;
  const pointsA = raw.player1Game?.points ?? null;
  const pointsB = raw.player2Game?.points ?? null;
  const result = raw.player2
    ? toGameResult(raw.player1Game?.result ?? null, raw.player2Game?.result ?? null)
    : 'a_win';
  return {
    bcpId: raw.id,
    eventBcpId: eventId,
    round: raw.round ?? round,
    tableNo: raw.table ?? null,
    teamMatchupBcpId: raw.teamPairingId ?? null,
    playerABcpId: raw.player1.id,
    playerBBcpId: raw.player2?.id ?? null,
    vpA: null,
    vpB: null,
    primaryA: null,
    primaryB: null,
    secondaryA: null,
    secondaryB: null,
    gamePointsA: pointsA,
    gamePointsB: pointsB,
    firstTurn: null,
    result,
  };
}

export function mapArmyList(raw: RawArmyList): ArmyList {
  const text = raw.armyListText?.trim();
  return { bcpId: raw.id, text: text === undefined || text === '' ? null : text };
}
