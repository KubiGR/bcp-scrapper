import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { theme } from '../theme';

export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} forceColorScheme="dark">
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MantineProvider>,
  );
}

/** Makes fetch answer every request with the given JSON body and status. */
export function stubFetchJson(body: unknown, status = 200) {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json(body, { status })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
