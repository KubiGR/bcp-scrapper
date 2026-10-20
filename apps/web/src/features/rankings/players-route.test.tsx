import { describe, expect, it } from 'vitest';
import '../../routeTree.gen';
import { Route } from '../../routes/players.index';

const validate = (search: Record<string, unknown>) =>
  (Route.options as { validateSearch: { parse: (s: unknown) => unknown } }).validateSearch.parse(
    search,
  );

describe('players route search', () => {
  it('keeps the name search as typed, spaces included, so full names can be searched', () => {
    expect(validate({ q: 'John ' })).toMatchObject({ q: 'John ' });
    expect(validate({ q: 'John Smith' })).toMatchObject({ q: 'John Smith' });
  });

  it('keeps a known Elo order and drops anything else', () => {
    expect(validate({ order: 'wh40kElo' })).toMatchObject({ order: 'wh40kElo' });
    expect(validate({ order: 'overall' })).toMatchObject({ order: 'overall' });
    expect(validate({ order: 'nope' })).not.toHaveProperty('order', 'nope');
  });
});
