import { describe, expect, it } from 'vitest';
import { EventListQuerySchema, SyncRequestSchema } from './index';

describe('SyncRequestSchema', () => {
  it('accepts a catalogue sync with a valid date range', () => {
    const request = { kind: 'catalog', from: '2026-01-01', to: '2026-03-31' };
    expect(SyncRequestSchema.parse(request)).toEqual(request);
  });

  it('rejects a catalogue sync whose range is reversed', () => {
    const result = SyncRequestSchema.safeParse({
      kind: 'catalog',
      from: '2026-03-31',
      to: '2026-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('requires an eventId for event-scoped syncs', () => {
    expect(SyncRequestSchema.safeParse({ kind: 'lists' }).success).toBe(false);
    expect(SyncRequestSchema.safeParse({ kind: 'lists', eventId: 'EVT1' }).success).toBe(true);
  });

  it('rejects unknown kinds', () => {
    expect(SyncRequestSchema.safeParse({ kind: 'everything' }).success).toBe(false);
  });
});

describe('EventListQuerySchema', () => {
  it('coerces query-string values and applies defaults', () => {
    expect(EventListQuerySchema.parse({ minPlayers: '40' })).toEqual({
      minPlayers: 40,
      type: 'all',
      sort: 'date',
      page: 1,
      pageSize: 50,
    });
  });

  it('accepts a player-size window and a biggest-first sort', () => {
    expect(
      EventListQuerySchema.parse({ minPlayers: '50', maxPlayers: '120', sort: 'players' }),
    ).toMatchObject({ minPlayers: 50, maxPlayers: 120, sort: 'players' });
  });

  it('rejects a size window whose maximum is below its minimum', () => {
    expect(EventListQuerySchema.safeParse({ minPlayers: '100', maxPlayers: '40' }).success).toBe(
      false,
    );
  });

  it('rejects page sizes above 100', () => {
    expect(EventListQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });
});
