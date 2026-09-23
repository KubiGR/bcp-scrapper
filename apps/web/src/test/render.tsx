import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { theme } from '../theme';

export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    // env="test" turns off transitions and portals, so drawers and menus render synchronously.
    <MantineProvider theme={theme} forceColorScheme="dark" env="test">
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MantineProvider>,
  );
}

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/** Makes fetch answer every request with the given JSON body and status. */
export function stubFetchJson(body: unknown, status = 200) {
  const fetchMock = vi.fn((..._args: FetchArgs) =>
    Promise.resolve(Response.json(body, { status })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * Answers fetch by "METHOD /path-prefix" keys, checked in insertion order (list the more specific
 * path first). A value is a JSON body, or a function returning a Response (for error statuses).
 * Unmatched requests reject, so a test fails loudly on an unexpected call.
 */
export function stubFetchRoutes(routes: Record<string, unknown>) {
  const fetchMock = vi.fn((...[input, init]: FetchArgs) => {
    const url = urlOf(input);
    const method = init?.method ?? 'GET';
    const match = Object.entries(routes).find(([key]) => {
      const [routeMethod, path] = key.split(' ');
      return routeMethod === method && path !== undefined && url.startsWith(path);
    });
    if (!match) return Promise.reject(new Error(`Unexpected ${method} ${url}`));
    const value = match[1];
    return Promise.resolve(
      typeof value === 'function' ? (value as () => Response)() : Response.json(value),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
