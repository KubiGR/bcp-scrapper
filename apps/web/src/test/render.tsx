import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { theme } from '../theme';

/** Renders inside Mantine and a fresh query client; `rerender` keeps both. */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, {
    wrapper: ({ children }) => (
      // env="test" turns off transitions and portals, so drawers and menus render synchronously.
      <MantineProvider theme={theme} forceColorScheme="dark" env="test">
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </MantineProvider>
    ),
  });
}

/**
 * Like renderWithProviders, inside a memory router whose every path renders `ui`, for components
 * with a `Link`. The router renders asynchronously: query with `findBy…`.
 */
export function renderWithRouter(ui: ReactElement) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory(),
  });
  return renderWithProviders(<RouterProvider router={router} />);
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
 * path first). A value is a JSON body, or a function of (url, init) returning a Response (for error
 * statuses, or answers that depend on the request).
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
      typeof value === 'function'
        ? (value as (url: string, init?: RequestInit) => Response)(url, init)
        : Response.json(value),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
