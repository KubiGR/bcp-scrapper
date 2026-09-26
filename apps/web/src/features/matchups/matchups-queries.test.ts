import { describe, expect, it } from 'vitest';
import { fromLegacySearch } from './matchups-queries';

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
