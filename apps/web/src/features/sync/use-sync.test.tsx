import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { stubFetchRoutes } from '../../test/render';
import { aSyncRun } from '../../test/sample-data';
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
      result.current.start({ kind: 'lists', eventId: 'EVT1' });
      result.current.start({ kind: 'lists', eventId: 'EVT1' });
    });

    await waitFor(() => {
      expect(result.current.run?.status).toBe('succeeded');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
