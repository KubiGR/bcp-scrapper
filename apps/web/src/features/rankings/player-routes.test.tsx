import { describe, expect, it } from 'vitest';
import '../../routeTree.gen';
import { Route as RootRoute } from '../../routes/__root';
import { Route as PlayerRoute } from '../../routes/players.$userId';

describe('player routes', () => {
  it('shows a player’s page on its own, not inside the ranking page', () => {
    // Under the ranking's route, /players/:userId would render the ranking (it has no outlet).
    const options = PlayerRoute.options as { getParentRoute: () => unknown };
    expect(options.getParentRoute()).toBe(RootRoute);
  });
});
