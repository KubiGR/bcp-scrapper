import {
  SaveRatingRequestSchema,
  SaveRatingsRequestSchema,
  type PairingEventTeamsResponse,
  type PairingResponse,
  type PairingTeamsResponse,
  type SaveRatingsResponse,
} from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { NotFoundError, ValidationError } from '../errors';
import { eventTeams, ratings, roster, saveRating, saveRatings } from '../repo/pairing-ratings';
import { parseInput } from '../validation';
import { requireEvent } from './require-event';
import { requireJson } from './require-json';

const PLAYERS = 5;

/** A team's pairing ratings against an opposing team in the same event; the analysis runs in the browser. */
export function pairingRoutes(deps: { db: Db }) {
  const { db } = deps;
  const teamsOf = async (eventId: string, teamId: string, opponentTeamId?: string) => {
    await requireEvent(db, eventId);
    const all = await eventTeams(db, eventId);
    const team = all.find((t) => t.id === teamId);
    if (!team) throw new NotFoundError(`Team ${teamId} is not part of event ${eventId}`);
    if (opponentTeamId === undefined) return { team, opponent: null, all };
    const opponent = all.find((t) => t.id === opponentTeamId);
    if (!opponent)
      throw new NotFoundError(`Team ${opponentTeamId} is not part of event ${eventId}`);
    if (opponent.id === team.id) {
      throw new ValidationError(
        [{ path: 'opponentTeamId', message: 'Pick another team' }],
        'A team cannot pair against itself',
      );
    }
    return { team, opponent, all };
  };

  /** Both rosters; refuses any player not on the right team. */
  const checkPlayers = async (
    eventId: string,
    teamId: string,
    opponentTeamId: string,
    pairs: { playerId: string; opponentPlayerId: string }[],
  ) => {
    const { team, opponent } = await teamsOf(eventId, teamId, opponentTeamId);
    if (!opponent) throw new NotFoundError('Opponent missing');
    const [ours, theirs] = await Promise.all([
      roster(db, eventId, team.id),
      roster(db, eventId, opponent.id),
    ]);
    const bad = pairs.some(
      ({ playerId, opponentPlayerId }) =>
        !ours.some((p) => p.id === playerId) || !theirs.some((p) => p.id === opponentPlayerId),
    );
    if (bad) {
      throw new ValidationError(
        [{ path: 'playerId', message: 'Not a player of these teams' }],
        'Those players are not on these teams',
      );
    }
    return { eventId, teamId: team.id, opponentTeamId: opponent.id };
  };

  return new Hono()
    .get('/events/:id/pairings', async (c) => {
      const id = c.req.param('id');
      await requireEvent(db, id);
      const body: PairingEventTeamsResponse = { teams: await eventTeams(db, id) };
      return c.json(body);
    })
    .get('/events/:id/teams/:teamId/pairings', async (c) => {
      const { id, teamId } = c.req.param();
      const { team, all } = await teamsOf(id, teamId);
      const body: PairingTeamsResponse = { team, opponents: all.filter((t) => t.id !== team.id) };
      return c.json(body);
    })
    .get('/events/:id/teams/:teamId/pairings/:opponentTeamId', async (c) => {
      const { id, teamId, opponentTeamId } = c.req.param();
      const { team, opponent } = await teamsOf(id, teamId, opponentTeamId);
      if (!opponent) throw new NotFoundError('Opponent missing');
      const [ours, theirs, stored] = await Promise.all([
        roster(db, id, team.id),
        roster(db, id, opponent.id),
        ratings(db, id, team.id, opponent.id),
      ]);
      const short = [
        [team, ours],
        [opponent, theirs],
      ] as const;
      const bad = short.find(([, list]) => list.length !== PLAYERS);
      const problem = bad
        ? `${bad[0].name} has ${bad[1].length} players; pairings need ${PLAYERS} on each team.`
        : null;
      const body: PairingResponse = { team, opponent, ours, theirs, ratings: stored, problem };
      return c.json(body);
    })
    .put(
      '/events/:id/teams/:teamId/pairings/:opponentTeamId/:playerId/:opponentPlayerId',
      requireJson,
      async (c) => {
        const { id, teamId, opponentTeamId, playerId, opponentPlayerId } = c.req.param();
        const { chip } = parseInput(
          SaveRatingRequestSchema,
          await c.req.json<unknown>().catch(() => null),
        );
        const key = await checkPlayers(id, teamId, opponentTeamId, [
          { playerId, opponentPlayerId },
        ]);
        await saveRating(db, { ...key, playerId, opponentPlayerId }, chip);
        return c.json({ rating: { playerId, opponentPlayerId, chip } });
      },
    )
    .put('/events/:id/teams/:teamId/pairings/:opponentTeamId', requireJson, async (c) => {
      const { id, teamId, opponentTeamId } = c.req.param();
      const { ratings: list } = parseInput(
        SaveRatingsRequestSchema,
        await c.req.json<unknown>().catch(() => null),
      );
      const key = await checkPlayers(id, teamId, opponentTeamId, list);
      await saveRatings(db, key, list);
      const body: SaveRatingsResponse = { saved: list.length };
      return c.json(body);
    });
}
