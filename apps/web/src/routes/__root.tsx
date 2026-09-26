import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router';
import { AppLayout } from '../components/AppLayout';
import { AuthGate } from '../features/auth/AuthGate';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({ component: Root });

/** The login page stands alone; everything else is the app, behind the login when it's on. */
function Root() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname === '/login') return <Outlet />;
  return (
    <AuthGate>
      <AppLayout />
    </AuthGate>
  );
}
