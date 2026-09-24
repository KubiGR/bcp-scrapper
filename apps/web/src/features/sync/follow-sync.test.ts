import { afterEach, describe, expect, it, vi } from 'vitest';
import { aSyncRun } from '../../test/sample-data';
import { followRun, startAndFollow } from './follow-sync';

type FetchMock = ReturnType<typeof vi.fn<(...args: [string, RequestInit?]) => Promise<Response>>>;

function stubFetch(): FetchMock {
  const fetchMock = vi.fn<(...args: [string, RequestInit?]) => Promise<Response>>();
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('startAndFollow', () => {
  it('starts a run and polls it until it finishes, reporting every state', async () => {
    const fetchMock = stubFetch()
      .mockResolvedValueOnce(Response.json(aSyncRun({ status: 'queued', done: 0 })))
      .mockResolvedValueOnce(Response.json(aSyncRun({ status: 'running', done: 1 })))
      .mockResolvedValueOnce(Response.json(aSyncRun({ status: 'succeeded', done: 7 })));
    const seen: string[] = [];

    const finished = await startAndFollow(
      { kind: 'event', eventId: 'EVT1' },
      (run) => {
        seen.push(run.status);
      },
      { pollMs: 0 },
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

describe('followRun', () => {
  it('stops polling once its signal is aborted', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch().mockImplementation(() =>
      Promise.resolve(Response.json(aSyncRun({ status: 'running' }))),
    );
    const controller = new AbortController();

    const following = followRun(aSyncRun({ status: 'running' }), () => undefined, {
      pollMs: 1000,
      signal: controller.signal,
    });
    const outcome = following.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(2500);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    controller.abort();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await outcome).toMatchObject({ name: 'AbortError' });
  });

  it('retries a failed poll and still finishes', async () => {
    const fetchMock = stubFetch()
      .mockRejectedValueOnce(new TypeError('network blip'))
      .mockResolvedValueOnce(Response.json(aSyncRun({ status: 'succeeded', done: 7 })));

    const finished = await followRun(aSyncRun({ status: 'running' }), () => undefined, {
      pollMs: 0,
    });

    expect(finished).toMatchObject({ status: 'succeeded', done: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after three retries, saying it lost track rather than that the sync failed', async () => {
    const fetchMock = stubFetch().mockRejectedValue(new TypeError('offline'));

    await expect(
      followRun(aSyncRun({ status: 'running' }), () => undefined, { pollMs: 0 }),
    ).rejects.toThrow('Lost track of the sync; it may still be running on the server');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
