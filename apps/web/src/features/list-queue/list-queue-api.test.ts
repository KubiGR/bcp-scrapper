import { describe, expect, it } from 'vitest';
import { formatDuration } from '../../lib/format';
import { describeQueueResult } from './list-queue-api';

const result = {
  queued: 7,
  alreadyQueued: 0,
  alreadyFetched: 2,
  noListOnBcp: 1,
  notQualifying: 0,
  estimatedSeconds: 35,
};

describe('describeQueueResult', () => {
  it('summarises what happened', () => {
    expect(describeQueueResult(result)).toBe(
      'Queued 7 lists · 2 already fetched · 1 has no list · about 35 s',
    );
    expect(
      describeQueueResult({
        ...result,
        queued: 1,
        alreadyFetched: 0,
        noListOnBcp: 0,
        estimatedSeconds: null,
      }),
    ).toBe('Queued 1 list');
  });
});

describe('formatDuration', () => {
  it('rounds to a readable wait', () => {
    expect(formatDuration(4)).toBe('4 s');
    expect(formatDuration(500)).toBe('8 min');
    expect(formatDuration(4800)).toBe('1 h 20 min');
  });
});
