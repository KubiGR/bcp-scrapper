import type { BcpStatus } from '@bcp/shared';
import { Hono } from 'hono';

export function bcpRoutes(deps: { bcpStatus: () => Promise<BcpStatus> }) {
  return new Hono().get('/bcp/status', async (c) => c.json(await deps.bcpStatus()));
}
