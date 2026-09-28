import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { stubFetchRoutes } from '../../test/render';
import { aSyncRun } from '../../test/sample-data';
import { LostTrackError } from './follow-sync';
import { useSync } from './use-sync';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return (
    <MantineProvider env="test">
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MantineProvider>
  );
}

describe('useSync', () => {
  it('ignores a second start while a sync is running', async () => {
    const fetchMock = stubFetchRoutes({ 'POST /api/sync': aSyncRun({ status: 'succeeded' }) });
    const { result } = renderHook(() => useSync({ label: 'Army lists', invalidate: [] }), {
      wrapper,
    });

    act(() => {
      result.current.start({ kind: 'event', eventId: 'EVT1' });
      result.current.start({ kind: 'event', eventId: 'EVT1' });
    });

    await waitFor(() => {
      expect(result.current.run?.status).toBe('succeeded');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes the page’s data after losing track, so its buttons aren’t stuck on “syncing”', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(
      () => useSync({ label: 'Event sync', invalidate: [['event', 'EVT1']] }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <MantineProvider env="test">
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
          </MantineProvider>
        ),
      },
    );
    act(() => {
      result.current.track(() => Promise.reject(new LostTrackError(new Error('offline'))));
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['event', 'EVT1'] });
    });
    expect(result.current.isSyncing).toBe(false);
  });
});
