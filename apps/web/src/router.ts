import { createRouter } from '@tanstack/react-router';
import { queryClient } from './api/query-client';
import { RouteError } from './components/RouteError';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultErrorComponent: RouteError,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
