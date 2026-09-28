import { describe, expect, it } from 'vitest';
import { EventSearchSchema } from './event-search';

describe('EventSearchSchema', () => {
  it('keeps the open list, and falls back to the players tab', () => {
    expect(EventSearchSchema.parse({ tab: 'rounds', list: 'PL-ADA' })).toEqual({
      tab: 'rounds',
      list: 'PL-ADA',
    });
    expect(EventSearchSchema.parse({ tab: 'nope' })).toEqual({ tab: 'players' });
    expect(EventSearchSchema.parse({ list: 42 })).toEqual({ tab: 'players' });
  });
});
