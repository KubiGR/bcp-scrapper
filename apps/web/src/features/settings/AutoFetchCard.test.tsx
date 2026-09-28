import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aUser, authOff, loggedIn } from '../auth/auth-test-utils';
import { AutoFetchCard } from './AutoFetchCard';

const state = (enabled: boolean, eventsPending = 0) => ({
  enabled,
  available: true,
  days: 45,
  lastPlannedAt: '2026-09-27T10:42:00.000Z',
  eventsPending,
});

describe('AutoFetchCard', () => {
  it('shows the switch and how many events are left', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/auto-fetch': state(true, 42) });
    renderWithProviders(<AutoFetchCard />);
    expect(await screen.findByRole('switch', { name: /Fetch big finished events/ })).toBeChecked();
    expect(screen.getByText(/42 events left/)).toBeInTheDocument();
    expect(screen.getByText(/of the last 45 days/)).toBeInTheDocument();
  });

  it('shows the switch off and locked when the server turned automatic fetching off', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/auto-fetch': { ...state(false), available: false, days: null },
    });
    renderWithProviders(<AutoFetchCard />);
    const toggle = await screen.findByRole('switch', { name: /Fetch big finished events/ });
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeDisabled();
    expect(screen.getByText(/turned off on the server/)).toBeInTheDocument();
  });

  it('switches off', async () => {
    let enabled = true;
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/auto-fetch': () => Response.json(state(enabled)),
      'POST /api/auto-fetch': () => {
        enabled = false;
        return Response.json(state(false));
      },
      'GET /api/fetch-queue': {},
    });
    renderWithProviders(<AutoFetchCard />);
    fireEvent.click(await screen.findByRole('switch', { name: /Fetch big finished events/ }));
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /Fetch big finished events/ })).not.toBeChecked();
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ enabled: false });
  });

  it('says when there is nothing left', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/auto-fetch': state(true, 0) });
    renderWithProviders(<AutoFetchCard />);
    expect(await screen.findByText(/Nothing left to fetch/)).toBeInTheDocument();
  });

  it('only admins can switch it when logins are on', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': loggedIn(aUser({ role: 'member' })),
      'GET /api/auto-fetch': state(true),
    });
    renderWithProviders(<AutoFetchCard />);
    expect(await screen.findByText('Only admins can change this')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /Fetch big finished events/ })).toBeDisabled();
    });
  });
});
