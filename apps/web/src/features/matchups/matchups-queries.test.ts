import { describe, expect, it, vi } from 'vitest';
import { crossMatchupsQuery, fromLegacySearch } from './matchups-queries';

describe('fromLegacySearch', () => {
  it('reads an old single `disposition` link into `dispositions`', () => {
    expect(fromLegacySearch({ disposition: 'Take and Hold', side: 'both' })).toEqual({
      dispositions: 'Take and Hold',
      side: 'both',
    });
  });

  it('keeps `dispositions` when both are present, and leaves other searches alone', () => {
    expect(fromLegacySearch({ disposition: 'X', dispositions: 'A,B' })).toEqual({
      dispositions: 'A,B',
    });
    expect(fromLegacySearch({ from: '2026-01-01' })).toEqual({ from: '2026-01-01' });
  });
});

describe('crossMatchupsQuery', () => {
  it('sends detachments and the side from the URL search', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        calls.push(url);
        return Promise.resolve(Response.json({}));
      }),
    );
    const { queryFn } = crossMatchupsQuery({ detachments: 'War Horde', side: 'both' });
    await Promise.resolve(queryFn?.({} as never)).catch(() => undefined);
    expect(calls[0]).toContain('detachments=War+Horde');
    expect(calls[0]).toContain('side=both');
  });
});
