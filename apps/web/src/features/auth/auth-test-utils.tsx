import type { MeResponse, User } from '@bcp/shared';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { renderWithProviders } from '../../test/render';

export function aUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    username: 'kubi',
    role: 'admin',
    mustChangePassword: false,
    disabled: false,
    ...overrides,
  };
}

export const loggedOut: MeResponse = { authRequired: true, user: null };
export const authOff: MeResponse = { authRequired: false, user: null };
export const loggedIn = (user: User = aUser()): MeResponse => ({ authRequired: true, user });

/**
 * A memory router with `/login` rendering `login` and every other path rendering `page`, starting
 * at `initial`. Returns the router so tests can read where it went.
 */
export function renderAtRoutes(options: {
  initial: string;
  page: ReactElement;
  login: ReactElement;
}) {
  const root = createRootRoute({ component: Outlet });
  const loginRoute = createRoute({
    getParentRoute: () => root,
    path: '/login',
    component: () => options.login,
  });
  const pageRoute = createRoute({
    getParentRoute: () => root,
    path: '$',
    component: () => options.page,
  });
  const indexRoute = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => options.page,
  });
  const router = createRouter({
    routeTree: root.addChildren([loginRoute, indexRoute, pageRoute]),
    history: createMemoryHistory({ initialEntries: [options.initial] }),
  });
  return { ...renderWithProviders(<RouterProvider router={router} />), router };
}
