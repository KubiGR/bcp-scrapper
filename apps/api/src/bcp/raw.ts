import { z } from 'zod';
import { BcpSchemaError } from '../errors';
import { formatIssues } from '../validation';

/**
 * Schemas for the parts of BCP's JSON we rely on. Unknown fields are ignored (and kept in
 * `raw` columns), so BCP adding fields never breaks us; removing or retyping one fails loudly.
 */

/** BCP sends numbers as numbers, numeric strings, or "" for "not entered". */
export function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const bcpNumber = z.unknown().transform(toNumberOrNull);

export const RawPageEnvelope = z.object({
  data: z.array(z.unknown()),
  // A string cursor means more pages. BCP sometimes sends an object instead (seen on the page
  // after the last one); anything but a string ends the paging.
  nextKey: z
    .unknown()
    .optional()
    .transform((value) => (typeof value === 'string' ? value : null)),
});

export const RawListEnvelope = z.object({ active: z.array(z.unknown()) });

export const RawEventSearchItem = z.object({
  id: z.string(),
  name: z.string(),
  eventDate: z.string(),
  eventEndDate: z.string().nullish(),
  country: z.string().nullish(),
  city: z.string().nullish(),
  totalPlayers: z.number().nullish(),
  /** The number of teams in a team event. */
  totalTeamPlayers: z.number().nullish(),
  teamEvent: z.boolean().nullish(),
  isOnlineEvent: z.boolean().nullish(),
  numberOfRounds: z.number().nullish(),
  ended: z.boolean().nullish(),
  hideLists: z.boolean().nullish(),
});
export type RawEventSearchItem = z.output<typeof RawEventSearchItem>;

export const RawEventDetail = z.object({
  id: z.string(),
  name: z.string(),
  dates: z.object({ start: z.string(), end: z.string().nullish() }),
  location: z.object({ city: z.string().nullish(), country: z.string().nullish() }).nullish(),
  format: z.object({ teamEvent: z.boolean().nullish() }).nullish(),
  status: z
    .object({ ended: z.boolean().nullish(), numberOfRounds: z.number().nullish() })
    .nullish(),
  playerCounts: z.object({ total: z.number().nullish() }).nullish(),
  teamPlayerCounts: z.object({ total: z.number().nullish() }).nullish(),
  flags: z.object({ hideLists: z.boolean().nullish() }).nullish(),
  isOnlineEvent: z.boolean().nullish(),
});
export type RawEventDetail = z.output<typeof RawEventDetail>;

const RawGameSummary = z.object({
  /** Restarts at 1 for bracket (pod) games, which follow the swiss rounds. */
  gameNum: z.number(),
  pod: z.boolean().nullish(),
  gameResult: bcpNumber,
  gamePoints: bcpNumber,
});
export type RawGameSummary = z.output<typeof RawGameSummary>;

export const RawPlayer = z.object({
  id: z.string(),
  user: z
    .object({
      id: z.string().nullish(),
      firstName: z.string().nullish(),
      lastName: z.string().nullish(),
    })
    .nullish(),
  teamPlayerId: z.string().nullish(),
  /** Names can be missing: BCP sometimes sends just `{ id }` (the faction is then unknown). */
  faction: z
    .object({
      name: z.string().nullish(),
      parentFaction: z.object({ name: z.string().nullish() }).nullish(),
    })
    .nullish(),
  /** The army's disposition (BCP's subFaction), e.g. "Take and Hold". */
  subFaction: z.object({ name: z.string().nullish() }).nullish(),
  placing: z.number().nullish(),
  dropped: z.boolean().nullish(),
  listId: z.string().nullish(),
  total_games: z.array(RawGameSummary).nullish(),
});
export type RawPlayer = z.output<typeof RawPlayer>;

export const RawTeam = z.object({
  id: z.string(),
  name: z.string().nullish(),
  placing: z.number().nullish(),
  total_games: z.array(RawGameSummary).nullish(),
});
export type RawTeam = z.output<typeof RawTeam>;

const RawSideResult = z.object({ result: bcpNumber, points: bcpNumber }).nullish();

export const RawTeamPairing = z.object({
  id: z.string(),
  round: z.number(),
  table: z.number().nullish(),
  teamPlayer1: z.object({ id: z.string() }).nullish(),
  teamPlayer2: z.object({ id: z.string() }).nullish(),
  player1Game: RawSideResult,
  player2Game: RawSideResult,
});
export type RawTeamPairing = z.output<typeof RawTeamPairing>;

/** An individual game from `/v1/events/{id}/pairings?pairingType=Pairing`: results, no metaData.
 * `round` is occasionally absent; the sync falls back to the round being fetched. */
export const RawEventGame = z.object({
  id: z.string(),
  round: z.number().nullish(),
  table: z.number().nullish(),
  teamPairingId: z.string().nullish(),
  player1: z.object({ id: z.string() }).nullish(),
  player2: z.object({ id: z.string() }).nullish(),
  player1Game: RawSideResult,
  player2Game: RawSideResult,
});
export type RawEventGame = z.output<typeof RawEventGame>;

export const RawPairing = z.object({
  id: z.string(),
  round: z.number(),
  table: z.number().nullish(),
  teamPairingId: z.string().nullish(),
  player1: z.object({ id: z.string() }).nullish(),
  player2: z.object({ id: z.string() }).nullish(),
  metaData: z.record(z.string(), z.unknown()).nullish(),
});
export type RawPairing = z.output<typeof RawPairing>;

export const RawArmyList = z.object({
  id: z.string(),
  armyListText: z.string().nullish(),
});
export type RawArmyList = z.output<typeof RawArmyList>;

export function parseBcp<S extends z.ZodType>(
  schema: S,
  data: unknown,
  endpoint: string,
): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new BcpSchemaError(endpoint, formatIssues(result.error));
  return result.data;
}

/** Parses each item separately so errors name the item, and keeps each item's original JSON. */
export function parseItems<S extends z.ZodType>(
  schema: S,
  items: unknown[],
  endpoint: string,
): { parsed: z.output<S>; raw: unknown }[] {
  return items.map((raw, index) => ({
    parsed: parseBcp(schema, raw, `${endpoint}[${index}]`),
    raw,
  }));
}
