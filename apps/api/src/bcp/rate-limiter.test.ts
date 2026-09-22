import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from './rate-limiter';

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('RateLimiter', () => {
  it('spaces task starts by 1 / requestsPerSecond', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 2, maxConcurrency: 10 });
    const starts: number[] = [];
    const all = Promise.all(
      [1, 2, 3].map(() =>
        limiter.run(() => {
          starts.push(Date.now());
          return Promise.resolve();
        }),
      ),
    );
    await vi.runAllTimersAsync();
    await all;
    expect(starts).toEqual([0, 500, 1000]);
  });

  it('never runs more than maxConcurrency tasks at once', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 1000, maxConcurrency: 1 });
    const { promise: firstBlocks, resolve: releaseFirst }: PromiseWithResolvers<void> =
      Promise.withResolvers();
    const order: string[] = [];

    const first = limiter.run(async () => {
      order.push('first:start');
      await firstBlocks;
      order.push('first:end');
    });
    const second = limiter.run(() => {
      order.push('second:start');
      return Promise.resolve();
    });

    await vi.runAllTimersAsync();
    expect(order).toEqual(['first:start']);

    releaseFirst();
    await vi.runAllTimersAsync();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('frees the slot when a task throws', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 1000, maxConcurrency: 1 });
    const failing = limiter.run(() => Promise.reject(new Error('boom')));
    const assertion = expect(failing).rejects.toThrow('boom');
    await vi.runAllTimersAsync();
    await assertion;

    const next = limiter.run(() => Promise.resolve('ok'));
    await vi.runAllTimersAsync();
    await expect(next).resolves.toBe('ok');
  });
});
