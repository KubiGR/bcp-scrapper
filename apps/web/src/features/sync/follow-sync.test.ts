import { describe, expect, it, vi } from 'vitest';
import { aSyncRun } from '../../test/sample-data';
import { startAndFollow } from './follow-sync';

describe('startAndFollow', () => {
  it('starts a run and polls it until it finishes, reporting every state', async () => {
    const fetchMock = vi
      .fn<(...args: [string, RequestInit?]) => Promise<Response>>()
      .mockResolvedValueOnce(Response.json(aSyncRun({ status: 'queued', done: 0 })))
      .mockResolvedValueOnce(Response.json(aSyncRun({ status: 'running', done: 1 })))
      .mockResolvedValueOnce(Response.json(aSyncRun({ status: 'succeeded', done: 7 })));
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];

    const finished = await startAndFollow(
      { kind: 'lists', eventId: 'EVT1' },
      (run) => {
        seen.push(run.status);
      },
      0,
    );

    expect(finished).toMatchObject({ status: 'succeeded', done: 7 });
    expect(seen).toEqual(['queued', 'running', 'succeeded']);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/sync',
      '/api/sync-runs/1',
      '/api/sync-runs/1',
    ]);
  });
});
