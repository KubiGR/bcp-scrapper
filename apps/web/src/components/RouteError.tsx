import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { ErrorState } from './ErrorState';

/** Shown when a route throws while rendering; Retry resets failed queries and re-renders. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const { reset: resetQueries } = useQueryErrorResetBoundary();
  return (
    <ErrorState
      error={error instanceof Error ? error : new Error(String(error))}
      onRetry={() => {
        resetQueries();
        reset();
        void router.invalidate();
      }}
    />
  );
}
