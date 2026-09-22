import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

/** Retrying cannot fix bad requests or an expired BCP login, so only retry the rest. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!(error instanceof ApiError)) return true;
  return error.code !== 'BCP_AUTH' && (error.status === 0 || error.status >= 500);
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: shouldRetry } },
});
