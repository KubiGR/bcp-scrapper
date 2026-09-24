import type { ArmyList, EventSummary, Game, Player, Team, TeamMatchup } from '@bcp/shared';
import type { z } from 'zod';
import { BcpUnavailableError, NotFoundError } from '../errors';
import {
  mapArmyList,
  mapEventDetail,
  mapEventGame,
  mapEventSearchItem,
  mapPairing,
  mapPlayer,
  mapTeam,
  mapTeamPairing,
} from './mappers';
import {
  parseBcp,
  parseItems,
  RawArmyList,
  RawEventDetail,
  RawEventGame,
  RawEventSearchItem,
  RawListEnvelope,
  RawPageEnvelope,
  RawPairing,
  RawPlayer,
  RawTeam,
  RawTeamPairing,
} from './raw';
import type { BcpTransport } from './transport';

/** Warhammer 40,000 in BCP's game-type numbering. */
const WARHAMMER_40K = 1;
const EVENT_PAGE_SIZE = 100;
const GAME_PAGE_SIZE = 500;

/** A mapped domain object plus the untouched BCP JSON it came from (stored in `raw` columns). */
export type Fetched<T> = T & { raw: unknown };

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Inclusive date range, YYYY-MM-DD. */
export interface DateRange {
  from: string;
  to: string;
}

export interface TournamentSource {
  listEvents(range: DateRange, cursor: string | null): Promise<Page<Fetched<EventSummary>>>;
  getEvent(eventId: string): Promise<Fetched<EventSummary>>;
  getPlayers(eventId: string): Promise<Fetched<Player>[]>;
  getTeams(eventId: string): Promise<Fetched<Team>[]>;
  getTeamMatchups(eventId: string, round: number): Promise<Fetched<TeamMatchup>[]>;
  getGames(eventId: string, round: number): Promise<Fetched<Game>[]>;
  /** A round's individual games from the event-level endpoint; BCP serves bracket events' games only here. */
  getEventGames(eventId: string, round: number): Promise<Fetched<Game>[]>;
  /** Null when BCP has no such list. */
  getList(listId: string): Promise<Fetched<ArmyList> | null>;
}

/**
 * The cursors one paging loop has followed. BCP answering with a cursor it already gave
 * would otherwise page forever.
 */
export class PageCursors {
  readonly #path: string;
  readonly #seen = new Set<string>();

  constructor(path: string) {
    this.#path = path;
  }

  /** Passes the next cursor through, or throws if this loop already followed it. */
  next(cursor: string | null): string | null {
    if (cursor === null) return null;
    if (this.#seen.has(cursor)) {
      throw new BcpUnavailableError(`BCP returned a repeated page cursor for ${this.#path}`);
    }
    this.#seen.add(cursor);
    return cursor;
  }
}

/** Reads tournaments from BCP's web API (or fixture files shaped like it). */
export class BcpSource implements TournamentSource {
  readonly #transport: BcpTransport;

  constructor(transport: BcpTransport) {
    this.#transport = transport;
  }

  async listEvents(range: DateRange, cursor: string | null): Promise<Page<Fetched<EventSummary>>> {
    const path = '/v1/events';
    const body = parseBcp(
      RawPageEnvelope,
      await this.#transport.get({
        path,
        query: {
          gameType: WARHAMMER_40K,
          startDate: `${range.from}T00:00:00Z`,
          endDate: `${range.to}T23:59:59Z`,
          sortKey: 'eventDate',
          sortAscending: 'true',
          limit: EVENT_PAGE_SIZE,
          nextKey: cursor ?? undefined,
        },
      }),
      path,
    );
    const items = parseItems(RawEventSearchItem, body.data, path).map(({ parsed, raw }) => ({
      ...mapEventSearchItem(parsed),
      raw,
    }));
    // BCP returns a nextKey even on the last page; an empty page is the real end.
    return { items, nextCursor: items.length > 0 ? (body.nextKey ?? null) : null };
  }

  async getEvent(eventId: string): Promise<Fetched<EventSummary>> {
    const path = `/v2/events/${encodeURIComponent(eventId)}`;
    const raw = await this.#transport.get({ path });
    return { ...mapEventDetail(parseBcp(RawEventDetail, raw, path)), raw };
  }

  async getPlayers(eventId: string): Promise<Fetched<Player>[]> {
    const path = `/v1/events/${encodeURIComponent(eventId)}/players`;
    const body = parseBcp(
      RawListEnvelope,
      await this.#transport.get({ path, query: { placings: 'true' } }),
      path,
    );
    return parseItems(RawPlayer, body.active, path).map(({ parsed, raw }) => ({
      ...mapPlayer(parsed, eventId),
      raw,
    }));
  }

  async getTeams(eventId: string): Promise<Fetched<Team>[]> {
    const path = `/v1/events/${encodeURIComponent(eventId)}/teamplayers`;
    const body = parseBcp(
      RawListEnvelope,
      await this.#transport.get({ path, query: { placings: 'true' } }),
      path,
    );
    return parseItems(RawTeam, body.active, path).map(({ parsed, raw }) => ({
      ...mapTeam(parsed, eventId),
      raw,
    }));
  }

  async getTeamMatchups(eventId: string, round: number): Promise<Fetched<TeamMatchup>[]> {
    const path = `/v1/events/${encodeURIComponent(eventId)}/pairings`;
    const body = parseBcp(
      RawListEnvelope,
      await this.#transport.get({ path, query: { round, pairingType: 'TeamPairing' } }),
      path,
    );
    return parseItems(RawTeamPairing, body.active, path).flatMap(({ parsed, raw }) => {
      const matchup = mapTeamPairing(parsed, eventId);
      return matchup ? [{ ...matchup, raw }] : [];
    });
  }

  async getGames(eventId: string, round: number): Promise<Fetched<Game>[]> {
    const path = '/v1/pairings';
    const games: Fetched<Game>[] = [];
    const seen = new PageCursors(path);
    let cursor: string | null = null;
    do {
      const body: z.output<typeof RawPageEnvelope> = parseBcp(
        RawPageEnvelope,
        await this.#transport.get({
          path,
          query: {
            eventId,
            round,
            pairingType: 'Pairing',
            limit: GAME_PAGE_SIZE,
            nextKey: cursor ?? undefined,
          },
        }),
        path,
      );
      for (const { parsed, raw } of parseItems(RawPairing, body.data, path)) {
        const game = mapPairing(parsed, eventId);
        if (game) games.push({ ...game, raw });
      }
      cursor = seen.next(body.data.length > 0 ? (body.nextKey ?? null) : null);
    } while (cursor !== null);
    return games;
  }

  async getEventGames(eventId: string, round: number): Promise<Fetched<Game>[]> {
    const path = `/v1/events/${encodeURIComponent(eventId)}/pairings`;
    const body = parseBcp(
      RawListEnvelope,
      await this.#transport.get({ path, query: { round, pairingType: 'Pairing' } }),
      path,
    );
    return parseItems(RawEventGame, body.active, path).flatMap(({ parsed, raw }) => {
      const game = mapEventGame(parsed, eventId, round);
      return game ? [{ ...game, raw }] : [];
    });
  }

  async getList(listId: string): Promise<Fetched<ArmyList> | null> {
    const path = `/v1/armylists/${encodeURIComponent(listId)}`;
    try {
      const raw = await this.#transport.get({ path });
      return { ...mapArmyList(parseBcp(RawArmyList, raw, path)), raw };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }
}
