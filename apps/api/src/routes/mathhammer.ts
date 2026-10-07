import { factionFamily, matchList, readListUnits, type UnitData } from '@bcp/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { findPlayerList } from '../repo/lists';
import { searchStoredLists } from '../repo/mathhammer-lists';
import { loadUnits } from '../repo/rules';
import { parseInput } from '../validation';
import { requireJson } from './require-json';

async function unitData(db: Db): Promise<UnitData> {
  const loaded = await loadUnits(db);
  if (loaded === null) {
    throw new NotFoundError(
      'The unit data from 39k.pro hasn’t been read yet: refresh it in Settings',
    );
  }
  return loaded.data;
}

const PastedListSchema = z.object({ text: z.string().trim().min(1).max(60_000) });

/** The factions with units, a faction's datasheets, and army lists read into units. */
export function mathhammerRoutes(deps: { db: Db }) {
  return new Hono<AuthEnv>()
    .get('/mathhammer/factions', async (c) => {
      const data = await unitData(deps.db);
      const names = [...new Set(data.datasheets.flatMap((d) => d.factions))].sort((a, b) =>
        a.localeCompare(b),
      );
      return c.json({
        factions: names.map((faction) => {
          const family = factionFamily(faction, data.factions);
          return {
            faction,
            units: data.datasheets.filter((d) => d.factions.some((f) => family.includes(f))).length,
          };
        }),
      });
    })
    .get('/mathhammer/units', async (c) => {
      const data = await unitData(deps.db);
      const faction = c.req.query('faction') ?? '';
      if (!data.datasheets.some((d) => d.factions.includes(faction))) {
        throw new NotFoundError(`No units for “${faction}”`);
      }
      const family = factionFamily(faction, data.factions);
      return c.json({
        faction,
        datasheets: data.datasheets
          .filter((d) => d.factions.some((f) => family.includes(f)))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    })
    .post('/mathhammer/list', requireJson, async (c) => {
      const { text } = parseInput(PastedListSchema, await c.req.json<unknown>().catch(() => null));
      return c.json(matchList(readListUnits(text), await unitData(deps.db)));
    })
    .get('/mathhammer/lists', async (c) =>
      c.json({ lists: await searchStoredLists(deps.db, c.req.query('search') ?? '') }),
    )
    .get('/mathhammer/lists/:playerId', async (c) => {
      const text = (await findPlayerList(deps.db, c.req.param('playerId')))?.text ?? null;
      if (text === null) throw new NotFoundError('No stored list for this player');
      return c.json(matchList(readListUnits(text), await unitData(deps.db)));
    });
}
