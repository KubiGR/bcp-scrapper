import { describe, expect, it } from 'vitest';
import { LoginLimiter } from './rate-limit';

const MINUTE = 60_000;

function limiter(limit: number) {
  let now = new Date('2026-09-01T10:00:00Z').getTime();
  const clock = {
    advance: (ms: number) => {
      now += ms;
    },
  };
  return {
    limiter: new LoginLimiter({ limit, windowMs: 15 * MINUTE, now: () => new Date(now) }),
    clock,
  };
}

describe('LoginLimiter', () => {
  it('blocks a key after the limit of failures, with the seconds left in the window', () => {
    const { limiter: l, clock } = limiter(5);
    for (let i = 0; i < 5; i += 1) {
      expect(l.check('ana:1.2.3.4').allowed).toBe(true);
      l.fail('ana:1.2.3.4');
    }
    clock.advance(5 * MINUTE);
    expect(l.check('ana:1.2.3.4')).toEqual({ allowed: false, retryAfterSeconds: 600 });
    expect(l.check('bob:1.2.3.4').allowed).toBe(true);
  });

  it('allows again once the window has passed', () => {
    const { limiter: l, clock } = limiter(5);
    for (let i = 0; i < 5; i += 1) l.fail('k');
    clock.advance(15 * MINUTE);
    expect(l.check('k').allowed).toBe(true);
  });

  it('a success clears the failures', () => {
    const { limiter: l } = limiter(5);
    for (let i = 0; i < 4; i += 1) l.fail('k');
    l.succeed('k');
    for (let i = 0; i < 4; i += 1) l.fail('k');
    expect(l.check('k').allowed).toBe(true);
  });

  it('release takes back one counted failure', () => {
    const { limiter: l } = limiter(2);
    l.fail('k');
    l.fail('k');
    expect(l.check('k').allowed).toBe(false);
    l.release('k');
    expect(l.check('k').allowed).toBe(true);
  });

  it('keeps at most maxKeys addresses in memory, dropping the oldest first', () => {
    const l = new LoginLimiter({ limit: 1, windowMs: 15 * MINUTE, maxKeys: 2 });
    l.fail('a');
    l.fail('b');
    l.fail('c');
    expect(l.size).toBe(2);
    expect(l.check('a').allowed).toBe(true);
    expect(l.check('c').allowed).toBe(false);
  });
});
