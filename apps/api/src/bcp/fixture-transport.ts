import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NotFoundError } from '../errors';
import type { BcpRequest, BcpTransport } from './transport';

/** File-name-safe version of an id or cursor (BCP cursors are base64 and may contain / and =). */
const safeSegment = (value: string | number) => String(value).replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * Where a BCP request's response lives inside a fixtures directory. Used both to serve
 * fixtures and to record them, so the two can never disagree.
 */
export function fixtureFileFor({ path: urlPath, query = {} }: BcpRequest): string {
  const cursor = query.nextKey === undefined ? 'first' : safeSegment(query.nextKey);
  const round = safeSegment(query.round ?? 0);
  const [, version, resource, id, sub] = urlPath.split('/');

  if (version === 'v1' && resource === 'events' && id === undefined) {
    return `events/search.${cursor}.json`;
  }
  if (version === 'v2' && resource === 'events' && id && sub === undefined) {
    return `events/${safeSegment(id)}/event.json`;
  }
  if (version === 'v1' && resource === 'events' && id) {
    if (sub === 'players') return `events/${safeSegment(id)}/players.json`;
    if (sub === 'teamplayers') return `events/${safeSegment(id)}/teams.json`;
    if (sub === 'pairings') {
      // The same URL serves team matchups and (for bracket events) individual games.
      const kind = query.pairingType === 'Pairing' ? 'event-games' : 'team-pairings';
      return `events/${safeSegment(id)}/${kind}.round-${round}.json`;
    }
  }
  if (version === 'v1' && resource === 'pairings' && query.eventId !== undefined) {
    return `events/${safeSegment(query.eventId)}/pairings.round-${round}.${cursor}.json`;
  }
  if (version === 'v1' && resource === 'armylists' && id) {
    return `armylists/${safeSegment(id)}.json`;
  }
  throw new Error(`No fixture mapping for ${urlPath}`);
}

/** Serves BCP responses from JSON files, for development and tests. */
export class FixtureTransport implements BcpTransport {
  readonly #rootDir: string;

  constructor(rootDir: string) {
    this.#rootDir = rootDir;
  }

  async get(request: BcpRequest): Promise<unknown> {
    const file = path.join(this.#rootDir, fixtureFileFor(request));
    try {
      return JSON.parse(await readFile(file, 'utf8')) as unknown;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new NotFoundError(`No fixture for ${request.path} (${file})`);
      }
      throw error;
    }
  }
}
