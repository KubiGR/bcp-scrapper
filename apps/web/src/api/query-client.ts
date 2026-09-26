import { QueryClient } from '@tanstack/react-query';
import { ME_QUERY_KEY } from '../features/auth/auth-queries';
import { ApiError, setUnauthorizedHandler } from './client';

/** Retrying cannot fix bad requests or an expired BCP login, so only retry the rest. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!(error instanceof ApiError)) return true;
  return error.code !== 'BCP_AUTH' && (error.status === 0 || error.status >= 500);
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: shouldRetry } },
});

// A 401 means the session ended: re-ask who is logged in, and the gate sends them to /login.
setUnauthorizedHandler(() => void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }));
