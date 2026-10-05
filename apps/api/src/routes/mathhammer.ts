import { factionFamily, type UnitData } from '@bcp/shared';
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { loadUnits } from '../repo/rules';

async function unitData(db: Db): Promise<UnitData> {
  const loaded = await loadUnits(db);
  if (loaded === null) {
    throw new NotFoundError(
      'The unit data from 39k.pro hasn’t been read yet: refresh it in Settings',
    );
  }
  return loaded.data;
}

/** The factions with units, and a faction's datasheets, for Mathhammer's pickers. */
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
    });
}
